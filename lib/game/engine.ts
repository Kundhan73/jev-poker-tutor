import { Card, fullDeck, shuffle } from "../poker/cards";
import { evaluate, winners as bestOf } from "../poker/evaluator";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Player {
  id: string;
  name: string;
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** Chips put in on the current street. */
  committed: number;
  /** Chips put in over the whole hand. */
  totalCommitted: number;
  needsToAct: boolean;
  isHuman: boolean;
  sittingOut: boolean;
}

export interface ActionEvent {
  street: Street;
  playerId: string;
  type: ActionType | "sb" | "bb";
  /** Total committed this street after the action. */
  to: number;
  /** Chips added by this action. */
  added: number;
  potAfter: number;
}

export interface PotResult {
  amount: number;
  eligible: string[];
  winners: string[];
}

export interface GameState {
  players: Player[];
  button: number;
  sb: number;
  bb: number;
  street: Street;
  board: Card[];
  deck: Card[];
  toAct: number;
  currentBet: number;
  /** Size of the last full raise (the minimum raise increment). */
  minRaise: number;
  history: ActionEvent[];
  handOver: boolean;
  results: PotResult[] | null;
  handNumber: number;
}

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: the total amount to commit this street ("raise to"). */
  amount?: number;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  /** "Raise to" bounds, as total committed this street. */
  minRaiseTo: number;
  maxRaiseTo: number;
  /** True if no bet yet this street (so an aggressive action is a "bet"). */
  isBet: boolean;
}

const clone = (s: GameState): GameState => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hole: [...p.hole] })),
  board: [...s.board],
  deck: [...s.deck],
  history: [...s.history],
  results: s.results ? [...s.results] : null,
});

export const pot = (s: GameState) => s.players.reduce((t, p) => t + p.totalCommitted, 0);

const inHand = (p: Player) => !p.sittingOut && !p.folded;
const canAct = (p: Player) => inHand(p) && !p.allIn;

function nextSeat(s: GameState, from: number, pred: (p: Player) => boolean): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (pred(s.players[idx])) return idx;
  }
  return -1;
}

export interface NewHandOptions {
  sb?: number;
  bb?: number;
  /** Pre-arranged deck for tests: dealt from the front. */
  deck?: Card[];
  handNumber?: number;
}

/**
 * Start a new hand. Players with 0 chips sit out. `button` is the seat index of the dealer
 * button (it should already be moved by the caller).
 */
export function newHand(
  seats: Pick<Player, "id" | "name" | "stack" | "isHuman">[],
  button: number,
  opts: NewHandOptions = {}
): GameState {
  const sb = opts.sb ?? 1;
  const bb = opts.bb ?? 2;
  const players: Player[] = seats.map((p) => ({
    ...p,
    hole: [],
    folded: false,
    allIn: false,
    committed: 0,
    totalCommitted: 0,
    needsToAct: false,
    sittingOut: p.stack <= 0,
  }));
  let s: GameState = {
    players,
    button,
    sb,
    bb,
    street: "preflop",
    board: [],
    deck: opts.deck ? [...opts.deck] : shuffle(fullDeck()),
    toAct: -1,
    currentBet: 0,
    minRaise: bb,
    history: [],
    handOver: false,
    results: null,
    handNumber: opts.handNumber ?? 1,
  };

  const active = players.filter((p) => !p.sittingOut);
  if (active.length < 2) throw new Error("Need at least 2 players with chips");
  if (players[button].sittingOut) s.button = nextSeat(s, button, (p) => !p.sittingOut);

  // Deal two cards each, starting left of the button
  for (let round = 0; round < 2; round++) {
    let idx = s.button;
    for (let k = 0; k < active.length; k++) {
      idx = nextSeat(s, idx, (p) => !p.sittingOut);
      s.players[idx].hole.push(s.deck.shift()!);
    }
  }

  const headsUp = active.length === 2;
  const sbSeat = headsUp ? s.button : nextSeat(s, s.button, (p) => !p.sittingOut);
  const bbSeat = nextSeat(s, sbSeat, (p) => !p.sittingOut);
  s = postBlind(s, sbSeat, sb, "sb");
  s = postBlind(s, bbSeat, bb, "bb");
  s.currentBet = bb;
  s.minRaise = bb;
  for (const p of s.players) p.needsToAct = canAct(p);
  s.toAct = nextSeat(s, bbSeat, canAct);
  return settleIfDone(s);
}

function postBlind(s: GameState, seat: number, amount: number, type: "sb" | "bb"): GameState {
  const p = s.players[seat];
  const paid = Math.min(amount, p.stack);
  p.stack -= paid;
  p.committed += paid;
  p.totalCommitted += paid;
  if (p.stack === 0) p.allIn = true;
  s.history.push({ street: "preflop", playerId: p.id, type, to: p.committed, added: paid, potAfter: pot(s) });
  return s;
}

export function legalActions(s: GameState): LegalActions {
  const p = s.players[s.toAct];
  const callAmount = Math.min(s.currentBet - p.committed, p.stack);
  const maxRaiseTo = p.committed + p.stack;
  const minRaiseTo = Math.min(s.currentBet + s.minRaise, maxRaiseTo);
  // A player may raise if they have chips beyond a call and someone else could still respond
  const othersCanAct = s.players.some((o, i) => i !== s.toAct && canAct(o));
  return {
    canFold: callAmount > 0,
    canCheck: callAmount === 0,
    canCall: callAmount > 0,
    callAmount,
    canRaise: maxRaiseTo > s.currentBet && othersCanAct,
    minRaiseTo,
    maxRaiseTo,
    isBet: s.currentBet === 0,
  };
}

/** Apply an action for the player to act. Returns a new state. Throws on illegal actions. */
export function applyAction(state: GameState, action: PlayerAction): GameState {
  if (state.handOver) throw new Error("Hand is over");
  const s = clone(state);
  const p = s.players[s.toAct];
  const legal = legalActions(s);
  let type = action.type;

  const commitTo = (to: number) => {
    const added = to - p.committed;
    p.stack -= added;
    p.committed = to;
    p.totalCommitted += added;
    if (p.stack === 0) p.allIn = true;
    return added;
  };

  let added = 0;
  switch (type) {
    case "fold":
      if (!legal.canFold) type = "check"; // folding when you can check is just a check
      else p.folded = true;
      break;
    case "check":
      if (!legal.canCheck) throw new Error("Cannot check facing a bet");
      break;
    case "call":
      if (!legal.canCall) throw new Error("Nothing to call");
      added = commitTo(p.committed + legal.callAmount);
      if (p.allIn) type = "allin";
      break;
    case "bet":
    case "raise":
    case "allin": {
      const to = type === "allin" ? legal.maxRaiseTo : Math.round(action.amount ?? 0);
      if (to <= s.currentBet) {
        // All-in for less than (or equal to) a call is just a call
        if (type === "allin" && legal.canCall) {
          added = commitTo(legal.maxRaiseTo);
          break;
        }
        throw new Error(`Raise to ${to} must exceed current bet ${s.currentBet}`);
      }
      if (to > legal.maxRaiseTo) throw new Error("Not enough chips");
      if (to < legal.minRaiseTo && to !== legal.maxRaiseTo) throw new Error(`Min raise is to ${legal.minRaiseTo}`);
      const increment = to - s.currentBet;
      added = commitTo(to);
      const fullRaise = increment >= s.minRaise;
      if (fullRaise) s.minRaise = increment;
      s.currentBet = to;
      for (const o of s.players) {
        if (o !== p && canAct(o) && (fullRaise || o.committed < s.currentBet)) o.needsToAct = true;
      }
      if (p.allIn) type = "allin";
      else type = legal.isBet ? "bet" : "raise";
      break;
    }
  }
  p.needsToAct = false;
  s.history.push({ street: s.street, playerId: p.id, type, to: p.committed, added, potAfter: pot(s) });
  s.toAct = nextSeat(s, s.toAct, (o) => canAct(o) && o.needsToAct);
  return settleIfDone(s);
}

/** Advance streets / finish the hand if the betting round is complete. */
function settleIfDone(s: GameState): GameState {
  const remaining = s.players.filter(inHand);
  if (remaining.length === 1) return finishHand(s);

  const roundOpen = s.players.some((p) => canAct(p) && p.needsToAct);
  if (roundOpen && s.toAct >= 0) return s;

  // Betting round complete: move to next street
  const actors = s.players.filter(canAct);
  const runOut = actors.length <= 1; // nobody left to bet against
  while (true) {
    if (s.street === "river") return finishHand(s);
    dealNextStreet(s);
    if (!runOut) {
      for (const p of s.players) p.needsToAct = canAct(p);
      s.toAct = nextSeat(s, s.button, canAct);
      return s;
    }
  }
}

function dealNextStreet(s: GameState) {
  for (const p of s.players) p.committed = 0;
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.deck.shift(); // burn
  if (s.street === "preflop") {
    s.board.push(s.deck.shift()!, s.deck.shift()!, s.deck.shift()!);
    s.street = "flop";
  } else if (s.street === "flop") {
    s.board.push(s.deck.shift()!);
    s.street = "turn";
  } else if (s.street === "turn") {
    s.board.push(s.deck.shift()!);
    s.street = "river";
  }
}

/** Split total contributions into main and side pots. */
export function buildPots(players: Player[]): { amount: number; eligible: string[] }[] {
  const levels = [...new Set(players.filter((p) => p.totalCommitted > 0).map((p) => p.totalCommitted))].sort(
    (a, b) => a - b
  );
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = players.reduce(
      (t, p) => t + Math.max(0, Math.min(p.totalCommitted, level) - Math.min(p.totalCommitted, prev)),
      0
    );
    const eligible = players.filter((p) => inHand(p) && p.totalCommitted >= level).map((p) => p.id);
    prev = level;
    if (amount === 0) continue;
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else if (eligible.length === 0 && last) last.amount += amount; // dead money from folded players
    else pots.push({ amount, eligible });
  }
  return pots;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function finishHand(s: GameState): GameState {
  const remaining = s.players.filter(inHand);
  s.toAct = -1;
  s.handOver = true;
  if (remaining.length === 1) {
    const w = remaining[0];
    const amount = pot(s);
    w.stack += amount;
    s.results = [{ amount, eligible: [w.id], winners: [w.id] }];
    return s;
  }
  // Deal any remaining board cards (all-in run-out)
  while (s.board.length < 5) {
    s.deck.shift();
    s.board.push(s.deck.shift()!);
  }
  s.street = "showdown";
  const scores = new Map(remaining.map((p) => [p.id, evaluate([...p.hole, ...s.board])]));
  const results: PotResult[] = [];
  for (const potInfo of buildPots(s.players)) {
    const elig = potInfo.eligible;
    const idxs = bestOf(elig.map((id) => scores.get(id)!));
    const winnerIds = idxs.map((i) => elig[i]);
    // Odd chips go to the first winner left of the button
    const ordered = orderFromButton(s, winnerIds);
    const share = Math.floor(potInfo.amount / ordered.length);
    let odd = potInfo.amount - share * ordered.length;
    for (const id of ordered) {
      const pl = s.players.find((p) => p.id === id)!;
      pl.stack += share + (odd > 0 ? 1 : 0);
      odd--;
    }
    results.push({ amount: potInfo.amount, eligible: elig, winners: ordered });
  }
  s.results = results;
  return s;
}

function orderFromButton(s: GameState, ids: string[]): string[] {
  const n = s.players.length;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const p = s.players[(s.button + i) % n];
    if (ids.includes(p.id)) out.push(p.id);
  }
  return out;
}

/** Position labels for a 6-max table, relative to the button. */
export function positionName(s: GameState, seat: number): string {
  const active = s.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.sittingOut);
  const n = active.length;
  const order: number[] = [];
  let idx = s.button;
  for (let k = 0; k < n; k++) {
    order.push(idx);
    idx = nextSeat(s, idx, (p) => !p.sittingOut);
  }
  const k = order.indexOf(seat);
  if (k < 0) return "";
  if (n === 2) return k === 0 ? "BTN/SB" : "BB";
  const names: Record<number, string[]> = {
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "CO"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  };
  return (names[n] ?? names[6])[k] ?? `MP${k}`;
}
