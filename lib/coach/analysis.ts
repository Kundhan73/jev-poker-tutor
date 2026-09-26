import { cardToString } from "../poker/cards";
import { ActionEvent, GameState, positionName } from "../game/engine";
import { actionMenu, ActionId, ActionOption, spotFacts, SpotFacts } from "../poker/spot";
import { callingRange, handClass, narrowRange, preflopWidth, Range, topPercentRange } from "../poker/ranges";
import { equityVsRanges } from "../poker/equity";
import { estimateEvs, EvEstimate, evSoftmax, bestByEv, foldProbability } from "../poker/ev";
import type { ActionLine, DecideRequest, DecideResponse, ReadResponse, SessionStats } from "../jev/types";

export const cardsStr = (cs: number[]) => cs.map(cardToString).join(" ");

export function actionLines(s: GameState): ActionLine[] {
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
  return s.history.map((h) => ({
    street: h.street,
    player: name(h.playerId),
    action: describe(h),
    amount: h.type === "fold" || h.type === "check" ? 0 : h.to,
    potAfter: h.potAfter,
  }));
}

function describe(h: ActionEvent): string {
  switch (h.type) {
    case "sb":
      return "posts small blind";
    case "bb":
      return "posts big blind";
    case "allin":
      return "goes all-in to";
    case "raise":
      return "raises to";
    case "bet":
      return "bets";
    case "call":
      return "calls";
    default:
      return h.type + "s";
  }
}

/** What the player did preflop this hand, for choosing their preflop range width. */
export function preflopAction(s: GameState, playerId: string): Parameters<typeof preflopWidth>[0] {
  let raisesBefore = 0;
  let result: Parameters<typeof preflopWidth>[0] = "none";
  for (const h of s.history) {
    if (h.street !== "preflop") break;
    const aggressive = h.type === "raise" || h.type === "bet" || (h.type === "allin" && h.to > s.bb);
    if (h.playerId === playerId) {
      if (aggressive) result = raisesBefore === 0 ? "open" : raisesBefore === 1 ? "3bet" : "4bet+";
      else if (h.type === "call") result = raisesBefore === 0 ? "limp" : result === "open" ? "open" : "call";
    }
    if (aggressive) raisesBefore++;
  }
  return result;
}

/** Math-only opponent read, from session stats and this hand's actions. */
export function heuristicRead(stats: SessionStats, s: GameState, playerId: string): ReadResponse {
  const hands = Math.max(1, stats.hands);
  const prior = 4; // shrink towards average with few hands observed
  const vpip = (stats.vpipHands + 0.28 * prior) / (hands + prior);
  const af = (stats.aggressive + 1) / (stats.passive + stats.checks * 0.5 + 1.5);
  // Both map the "average" player (AF ≈ 1, VPIP ≈ 28%) to ~0.5
  const aggression = af / (af + 1);
  const looseness = vpip / (vpip + 0.28);

  const mine = s.history.filter((h) => h.playerId === playerId && h.street !== "preflop");
  const aggro = mine.filter((h) => h.type === "bet" || h.type === "raise" || h.type === "allin").length;
  const calls = mine.filter((h) => h.type === "call").length;
  const pfa = preflopAction(s, playerId);
  let rangeStrength = { none: 0.3, limp: 0.3, call: 0.4, open: 0.45, "3bet": 0.65, "4bet+": 0.8 }[pfa];
  // Aggression from a passive player means more than from a maniac
  rangeStrength += aggro * (0.18 * (1.1 - aggression)) + calls * 0.06;
  const last = s.history.filter((h) => h.playerId === playerId).at(-1);
  const lastAggro = last && (last.type === "bet" || last.type === "raise" || last.type === "allin");
  return {
    aggression,
    looseness,
    rangeStrength: Math.min(0.95, rangeStrength),
    bluffing: lastAggro ? Math.min(0.6, 0.08 + 0.4 * aggression * (1 - Math.min(1, rangeStrength))) : 0.15,
    source: "math",
  };
}

export function opponentRange(s: GameState, seat: number, read: ReadResponse, dead: number[], valueOnly = false): Range {
  const p = s.players[seat];
  const width = preflopWidth(preflopAction(s, p.id), read.looseness);
  let r = topPercentRange(width, dead);
  if (s.board.length >= 3) r = narrowRange(r, s.board, read, valueOnly);
  return r;
}

/**
 * Pull style reads (aggression, looseness) towards neutral when few hands have been observed,
 * so two hands of data can't produce an extreme read. Hand-specific reads are left alone.
 */
export function shrinkStyle<T extends { aggression: number; looseness: number }>(read: T, handsObserved: number): T {
  const trust = handsObserved / (handsObserved + 6);
  return {
    ...read,
    aggression: 0.5 + (read.aggression - 0.5) * trust,
    looseness: 0.5 + (read.looseness - 0.5) * trust,
  };
}

export interface Analysis {
  facts: SpotFacts;
  menu: ActionOption[];
  equity: number;
  evs: EvEstimate[];
  ranges: Record<string, Range>;
  request: DecideRequest;
}

export function analyse(s: GameState, heroSeat: number, reads: Record<string, ReadResponse>): Analysis {
  const hero = s.players[heroSeat];
  const facts = spotFacts(s, heroSeat);
  const menu = actionMenu(s);
  const dead = [...hero.hole, ...s.board];
  const opps = s.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== heroSeat && !p.folded && !p.sittingOut);
  const ranges: Record<string, Range> = {};
  for (const { p, i } of opps) ranges[p.id] = opponentRange(s, i, reads[p.id], dead);
  const { equity } = equityVsRanges(hero.hole, s.board, Object.values(ranges), 3000);
  // For each bet size, opponents continue with only the strongest part of their range
  const equityIfCalled = (o: ActionOption) => {
    const callers = opps.map(({ p }) =>
      callingRange(ranges[p.id], s.board, 1 - foldProbability(o.potFraction ?? 1, reads[p.id]))
    );
    return Math.min(equity, equityVsRanges(hero.hole, s.board, callers, 2000).equity);
  };
  const evs = estimateEvs(menu, facts.pot, equity, equityIfCalled, opps.map(({ p }) => reads[p.id]));
  const lines = actionLines(s);

  const request: DecideRequest = {
    hero: {
      cards: cardsStr(hero.hole),
      handClass: handClass(hero.hole[0], hero.hole[1]),
      position: facts.position,
      stack: hero.stack,
    },
    street: s.street,
    board: cardsStr(s.board),
    pot: facts.pot,
    toCall: facts.toCall,
    potOdds: facts.potOdds,
    spr: facts.spr,
    texture: facts.texture?.description ?? null,
    equity,
    opponents: opps.map(({ p, i }) => ({
      name: p.name,
      position: positionName(s, i),
      stack: p.stack,
      read: reads[p.id],
      thisHand: lines.filter((l) => l.player === p.name).map((l) => `${l.street}: ${l.action}${l.amount ? " " + l.amount : ""}`),
    })),
    history: lines,
    options: menu.map((o) => {
      const e = evs.find((x) => x.id === o.id)!;
      return { id: o.id, label: o.label, cost: o.cost, evChips: e.ev, foldEquity: e.foldEquity, equityIfCalled: e.equityIfCalled };
    }),
  };
  return { facts, menu, equity, evs, ranges, request };
}

export function mathDecision(a: Analysis): DecideResponse {
  const probs = evSoftmax(a.evs, a.facts.pot);
  const best = bestByEv(a.evs);
  return {
    source: "math",
    choice: best.id,
    probabilities: probs as DecideResponse["probabilities"],
    confidence: probs[best.id],
  };
}

export type Grade = "Best" | "Good" | "Questionable" | "Mistake";

/** Grade a choice relative to the coach's probability for the top action. */
export function grade(probabilities: Partial<Record<ActionId, number>>, chosen: ActionId): Grade {
  const top = Math.max(...Object.values(probabilities).map((v) => v ?? 0));
  const p = probabilities[chosen] ?? 0;
  const ratio = top > 0 ? p / top : 0;
  if (ratio >= 0.8) return "Best";
  if (ratio >= 0.4) return "Good";
  if (ratio >= 0.12) return "Questionable";
  return "Mistake";
}

/** Map a custom slider raise onto the closest menu option (for grading). */
export function closestOption(menu: ActionOption[], raiseTo: number, maxTo: number): ActionId {
  if (raiseTo >= maxTo) return "all_in";
  const raises = menu.filter((o) => o.action.amount !== undefined);
  if (!raises.length) return "all_in";
  return raises.reduce((a, b) =>
    Math.abs((b.action.amount ?? 0) - raiseTo) < Math.abs((a.action.amount ?? 0) - raiseTo) ? b : a
  ).id;
}
