import type { ActionId } from "../poker/spot";
import type { OpponentRead } from "../poker/ranges";

export interface SessionStats {
  hands: number;
  vpipHands: number;
  pfrHands: number;
  /** Bets + raises (postflop and preflop). */
  aggressive: number;
  /** Calls. */
  passive: number;
  checks: number;
  folds: number;
  /** Recent hands this player showed down: "Kh Qh (Two Pair) after raising river". */
  showdowns: string[];
}

export const emptyStats = (): SessionStats => ({
  hands: 0,
  vpipHands: 0,
  pfrHands: 0,
  aggressive: 0,
  passive: 0,
  checks: 0,
  folds: 0,
  showdowns: [],
});

export interface ActionLine {
  street: string;
  player: string;
  action: string;
  amount: number;
  potAfter: number;
}

export interface ReadRequest {
  opponent: {
    name: string;
    position: string;
    stack: number;
    stats: {
      hands_observed: number;
      vpip_pct: number;
      pfr_pct: number;
      aggression_factor: number | null;
      fold_pct: number;
      recent_showdowns: string[];
    };
  };
  street: string;
  board: string;
  pot: number;
  thisHand: ActionLine[];
  /** True when the opponent's latest action was a bet or raise (we then ask about bluffing). */
  lastWasAggressive: boolean;
}

export interface ReadResponse extends OpponentRead {
  /** 0 = nit, 1 = plays nearly everything. */
  looseness: number;
  source: "jev" | "math";
  confidence?: number;
  latencyMs?: number;
}

export interface DecideRequest {
  hero: { cards: string; handClass: string; position: string; stack: number };
  street: string;
  board: string;
  pot: number;
  toCall: number;
  potOdds: number | null;
  spr: number;
  texture: string | null;
  equity: number;
  opponents: { name: string; position: string; stack: number; read: ReadResponse; thisHand: string[] }[];
  history: ActionLine[];
  options: { id: ActionId; label: string; cost: number; evChips: number; foldEquity?: number; equityIfCalled?: number }[];
}

export interface DecideResponse {
  source: "jev" | "math";
  choice: ActionId;
  probabilities: Partial<Record<ActionId, number>>;
  confidence: number;
  model?: string;
  latencyMs?: number;
  error?: string;
}
