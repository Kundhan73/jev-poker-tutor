import { ActionId, ActionOption } from "./spot";
import { OpponentRead } from "./ranges";

export interface EvEstimate {
  id: ActionId;
  /** Estimated chip EV of the action, relative to folding now (fold = 0). */
  ev: number;
  /** Estimated chance everyone folds to this bet/raise. */
  foldEquity?: number;
  /** Equity against the hands that call this bet/raise. */
  equityIfCalled?: number;
}

/**
 * Probability one opponent folds to a bet of the given pot fraction. Starts from the minimum
 * defense frequency (a player continues about pot / (pot + bet) of the time, so a pot-sized bet
 * gets called ~50% and a 10x overbet ~9%), then adjusts it: players with strong ranges or
 * aggressive styles continue more often.
 */
export function foldProbability(potFraction: number, read: OpponentRead): number {
  const mdf = 1 / (1 + Math.max(0.05, potFraction));
  const stubbornness = 0.65 + 0.4 * read.rangeStrength + 0.15 * read.aggression;
  return 1 - Math.min(0.97, Math.max(0.02, mdf * stubbornness));
}

/**
 * Simple one-street chip-EV model. It's a teaching approximation, not a solver:
 *  - check: equity share of the current pot
 *  - call:  equity × final pot − cost
 *  - bet/raise: fold equity × pot + (1 − fold equity) × (equityIfCalled × bigger pot − cost)
 * `equityIfCalled` is equity against only the hands that would call that bet size (the strongest
 * part of their range), given per option or as one number for all sizes.
 */
export function estimateEvs(
  opts: ActionOption[],
  pot: number,
  equity: number,
  equityIfCalled: number | ((o: ActionOption) => number),
  reads: OpponentRead[]
): EvEstimate[] {
  // Facing a bet, a caller of our raise only adds the difference above what they already bet
  const toCall = opts.find((o) => o.id === "call")?.cost ?? 0;
  return opts.map((o) => {
    switch (o.id) {
      case "fold":
        return { id: o.id, ev: 0 };
      case "check":
        return { id: o.id, ev: equity * pot };
      case "call":
        return { id: o.id, ev: equity * (pot + o.cost) - o.cost };
      default: {
        const frac = o.potFraction ?? 1;
        const allFold = reads.reduce((t, r) => t * foldProbability(frac, r), 1);
        const calledPot = pot + o.cost + (o.cost - toCall);
        const eqCalled = typeof equityIfCalled === "number" ? equityIfCalled : equityIfCalled(o);
        const ev = allFold * pot + (1 - allFold) * (eqCalled * calledPot - o.cost);
        return { id: o.id, ev, foldEquity: allFold, equityIfCalled: eqCalled };
      }
    }
  });
}

/** Pick the highest-EV action (used in math-only mode). */
export function bestByEv(evs: EvEstimate[]): EvEstimate {
  return evs.reduce((a, b) => (b.ev > a.ev + 1e-9 ? b : a));
}

/** Turn EVs into a soft probability distribution (for the probability bars in math-only mode). */
export function evSoftmax(evs: EvEstimate[], pot: number): Record<string, number> {
  const temp = Math.max(1, pot * 0.08);
  const max = Math.max(...evs.map((e) => e.ev));
  const exps = evs.map((e) => Math.exp((e.ev - max) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Object.fromEntries(evs.map((e, i) => [e.id, exps[i] / sum]));
}
