import { Card, rankOf, suitOf } from "./cards";
import { GameState, legalActions, PlayerAction, pot, positionName } from "../game/engine";

export type ActionId = "fold" | "check" | "call" | "raise_small" | "raise_medium" | "raise_big" | "all_in";

export interface ActionOption {
  id: ActionId;
  label: string;
  action: PlayerAction;
  /** Chips added to the pot by taking this action. */
  cost: number;
  /** Size relative to the pot, for bets/raises. */
  potFraction?: number;
}

export interface BoardTexture {
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  connected: boolean;
  highCard: string;
  description: string;
}

/** Concrete menu of actions for the player to act, with sensible bet sizes. */
export function actionMenu(s: GameState): ActionOption[] {
  const l = legalActions(s);
  const p = s.players[s.toAct];
  const potNow = pot(s);
  const opts: ActionOption[] = [];
  if (l.canFold) opts.push({ id: "fold", label: "Fold", action: { type: "fold" }, cost: 0 });
  if (l.canCheck) opts.push({ id: "check", label: "Check", action: { type: "check" }, cost: 0 });
  if (l.canCall)
    opts.push({
      id: "call",
      label: `Call ${l.callAmount}`,
      action: { type: "call" },
      cost: l.callAmount,
    });
  if (l.canRaise) {
    const verb = l.isBet ? "Bet" : "Raise to";
    let sizes: { id: ActionId; to: number }[];
    if (s.street === "preflop") {
      const base = s.currentBet;
      const limpers = s.players.filter((o) => !o.folded && o.committed === s.currentBet).length - 1;
      const open = s.currentBet === s.bb;
      sizes = open
        ? [
            { id: "raise_small", to: Math.round(s.bb * (2.5 + limpers)) },
            { id: "raise_medium", to: Math.round(s.bb * (3 + limpers)) },
            { id: "raise_big", to: Math.round(s.bb * (4 + limpers)) },
          ]
        : [
            { id: "raise_small", to: Math.round(base * 2.5) },
            { id: "raise_medium", to: Math.round(base * 3) },
            { id: "raise_big", to: Math.round(base * 4) },
          ];
    } else {
      const potAfterCall = potNow + l.callAmount;
      sizes = [
        { id: "raise_small", to: Math.round(s.currentBet + potAfterCall * 0.33) },
        { id: "raise_medium", to: Math.round(s.currentBet + potAfterCall * 0.66) },
        { id: "raise_big", to: Math.round(s.currentBet + potAfterCall * 1.0) },
      ];
    }
    const seen = new Set<number>();
    for (const { id, to: raw } of sizes) {
      const to = Math.max(l.minRaiseTo, raw);
      if (to >= l.maxRaiseTo || seen.has(to)) continue;
      seen.add(to);
      const cost = to - p.committed;
      opts.push({
        id,
        label: `${verb} ${to}`,
        action: { type: l.isBet ? "bet" : "raise", amount: to },
        cost,
        potFraction: (to - s.currentBet) / Math.max(1, potNow + l.callAmount),
      });
    }
    opts.push({
      id: "all_in",
      label: `All-in ${l.maxRaiseTo}`,
      action: { type: "allin" },
      cost: p.stack,
      potFraction: (l.maxRaiseTo - s.currentBet) / Math.max(1, potNow + l.callAmount),
    });
  } else if (l.canCall && l.callAmount === p.stack) {
    // Calling puts us all-in; relabel for clarity
    const call = opts.find((o) => o.id === "call")!;
    call.label = `Call all-in ${l.callAmount}`;
  }
  return opts;
}

export function boardTexture(board: Card[]): BoardTexture | null {
  if (board.length < 3) return null;
  const ranks = board.map(rankOf).sort((a, b) => b - a);
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[suitOf(c)]++;
  const maxSuit = Math.max(...suits);
  const paired = new Set(ranks).size < ranks.length;
  const uniq = [...new Set(ranks)];
  let connected = false;
  for (let i = 0; i + 2 < uniq.length; i++) if (uniq[i] - uniq[i + 2] <= 4) connected = true;
  const monotone = maxSuit >= 3;
  const twoTone = maxSuit === 2;
  const parts = [
    paired ? "paired" : null,
    monotone ? `${maxSuit}-flush board` : twoTone ? "flush draw possible" : "rainbow",
    connected ? "straight-draw heavy" : "disconnected",
  ].filter(Boolean);
  const wet = monotone || connected || (twoTone && paired === false && ranks[0] - ranks[ranks.length - 1] <= 6);
  return {
    paired,
    monotone,
    twoTone,
    connected,
    highCard: "23456789TJQKA"[ranks[0]],
    description: `${wet ? "Wet" : twoTone ? "Semi-wet" : "Dry"}: ${parts.join(", ")}`,
  };
}

export interface SpotFacts {
  street: string;
  position: string;
  pot: number;
  toCall: number;
  potOdds: number | null;
  stack: number;
  effectiveStack: number;
  spr: number;
  playersInHand: number;
  texture: BoardTexture | null;
}

export function spotFacts(s: GameState, seat: number): SpotFacts {
  const p = s.players[seat];
  const potNow = pot(s);
  const toCall = Math.max(0, Math.min(s.currentBet - p.committed, p.stack));
  const opps = s.players.filter((o, i) => i !== seat && !o.folded && !o.sittingOut);
  const effectiveStack = Math.min(p.stack, Math.max(0, ...opps.map((o) => o.stack)));
  return {
    street: s.street,
    position: positionName(s, seat),
    pot: potNow,
    toCall,
    potOdds: toCall > 0 ? toCall / (potNow + toCall) : null,
    stack: p.stack,
    effectiveStack,
    spr: potNow > 0 ? effectiveStack / potNow : 0,
    playersInHand: opps.length + 1,
    texture: boardTexture(s.board),
  };
}
