import { Card, RANKS, rankOf, suitOf } from "./cards";
import { evaluate } from "./evaluator";

/** A weighted range over concrete two-card combos. */
export interface Combo {
  a: Card;
  b: Card;
  w: number;
}
export type Range = Combo[];

/** "AKs", "AKo", "QQ" – the 169 starting-hand classes. Higher rank first. */
export function handClass(a: Card, b: Card): string {
  const ra = rankOf(a);
  const rb = rankOf(b);
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suitOf(a) === suitOf(b) ? "s" : "o");
}

/** Chen-formula style preflop strength, used only to order hands from best to worst. */
export function preflopScore(cls: string): number {
  const val = (r: string) => {
    const i = RANKS.indexOf(r as never);
    return [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10][i];
  };
  const hi = cls[0];
  const lo = cls[1];
  let s = val(hi);
  if (hi === lo) return Math.max(5, s * 2) + 0.01 * RANKS.indexOf(hi as never);
  if (cls[2] === "s") s += 2;
  const gap = RANKS.indexOf(hi as never) - RANKS.indexOf(lo as never) - 1;
  s -= [0, 1, 2, 4, 5, 5, 5, 5, 5, 5, 5, 5][gap] ?? 5;
  if (gap <= 1 && RANKS.indexOf(hi as never) < RANKS.indexOf("Q")) s += 1;
  return s + 0.01 * RANKS.indexOf(lo as never);
}

/** All 169 classes, strongest first, with their combo count. */
export const HAND_CLASSES: { cls: string; combos: number }[] = (() => {
  const out: { cls: string; combos: number }[] = [];
  for (let i = 12; i >= 0; i--)
    for (let j = i; j >= 0; j--) {
      if (i === j) out.push({ cls: RANKS[i] + RANKS[j], combos: 6 });
      else {
        out.push({ cls: RANKS[i] + RANKS[j] + "s", combos: 4 });
        out.push({ cls: RANKS[i] + RANKS[j] + "o", combos: 12 });
      }
    }
  return out.sort((x, y) => preflopScore(y.cls) - preflopScore(x.cls));
})();

const CLASS_RANK = new Map(HAND_CLASSES.map((h, i) => [h.cls, i]));

/** Percentile (0 = best hand, 1 = worst) of a starting hand among all combos. */
export const classPercentile = (() => {
  const cum = new Map<string, number>();
  let acc = 0;
  for (const h of HAND_CLASSES) {
    cum.set(h.cls, (acc + h.combos / 2) / 1326);
    acc += h.combos;
  }
  return (cls: string) => cum.get(cls) ?? 1;
})();

export const classRank = (cls: string) => CLASS_RANK.get(cls) ?? 168;

/** All 1326 combos that don't use dead cards. */
export function allCombos(dead: Card[] = []): Range {
  const d = new Set(dead);
  const out: Range = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) if (!d.has(a) && !d.has(b)) out.push({ a, b, w: 1 });
  return out;
}

/**
 * Top-X% preflop range with a soft edge, so ranges blend rather than cut off hard.
 * `pct` in (0,1].
 */
export function topPercentRange(pct: number, dead: Card[] = [], softness = 0.06): Range {
  return allCombos(dead)
    .map((c) => {
      const p = classPercentile(handClass(c.a, c.b));
      const w = p <= pct ? 1 : Math.max(0, 1 - (p - pct) / softness);
      return { ...c, w };
    })
    .filter((c) => c.w > 0);
}

/**
 * Made-hand strength of each combo on this board, as a percentile in [0,1] (1 = nuts),
 * with a small bonus for strong draws when cards are still to come.
 */
export function boardStrengths(range: Range, board: Card[]): number[] {
  if (board.length < 3) return range.map((c) => 1 - classPercentile(handClass(c.a, c.b)));
  const raw = range.map((c) => evaluate([c.a, c.b, ...board]) + drawBonus(c, board));
  const sorted = [...raw].sort((x, y) => x - y);
  return raw.map((v) => lowerBound(sorted, v) / Math.max(1, sorted.length - 1));
}

function lowerBound(arr: number[], v: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Adds roughly "one pair" worth of score for a flush draw or open-ended straight draw. */
function drawBonus(c: Combo, board: Card[]): number {
  if (board.length >= 5) return 0;
  const cardsAll = [c.a, c.b, ...board];
  const suits = [0, 0, 0, 0];
  for (const x of cardsAll) suits[suitOf(x)]++;
  const fd = suits.some((n, s) => n === 4 && (suitOf(c.a) === s || suitOf(c.b) === s));
  // Bit r+1 for each rank, plus bit 0 for an ace playing low
  let mask = 0;
  for (const x of cardsAll) mask |= 1 << (rankOf(x) + 1);
  if (mask & (1 << 13)) mask |= 1;
  let oesd = false;
  for (let lo = 1; lo <= 9; lo++) if (((mask >> lo) & 0b1111) === 0b1111) oesd = true;
  const pairScore = 1 << 20;
  return (fd ? pairScore : 0) + (oesd ? pairScore * 0.8 : 0);
}

export interface OpponentRead {
  /** 0 = very passive, 1 = maniac. */
  aggression: number;
  /** 0 = weak/wide range, 1 = nutted. */
  rangeStrength: number;
  /** Probability the last bet is a bluff, 0..1. */
  bluffing: number;
}

export const NEUTRAL_READ: OpponentRead = { aggression: 0.5, rangeStrength: 0.4, bluffing: 0.25 };

/**
 * Share of a betting range that is bluffs, given the probability that the latest bet is a bluff.
 * The read is a yes/no probability ("more likely bluff than value?"), not a frequency: 0.5 means
 * "can't tell", so it maps to roughly a standard bluffing frequency rather than half the range.
 */
export const bluffShare = (bluffing: number) => Math.min(0.4, Math.max(0.05, 0.05 + 0.4 * bluffing));

/**
 * Re-weight a range using an opponent read. The value part weights combos by strength^k
 * (k grows with rangeStrength); the bluff part favours weak hands. Each part is normalised
 * before mixing, so `bluffShare` really is the fraction of the range that is bluffs.
 * Pass `valueOnly` for the range that continues when you raise (bluffs fold).
 */
export function narrowRange(range: Range, board: Card[], read: OpponentRead, valueOnly = false): Range {
  const strengths = boardStrengths(range, board);
  const k = Math.max(0, (read.rangeStrength - 0.3) * 5);
  const b = valueOnly ? 0 : bluffShare(read.bluffing);
  const value = range.map((c, i) => c.w * Math.pow(Math.max(strengths[i], 0.001), k));
  const bluffs = range.map((c, i) => c.w * (1 - strengths[i]));
  const vSum = value.reduce((t, x) => t + x, 0) || 1;
  const bSum = bluffs.reduce((t, x) => t + x, 0) || 1;
  return range
    .map((c, i) => ({ ...c, w: (1 - b) * (value[i] / vSum) + b * (bluffs[i] / bSum) }))
    .filter((c) => c.w > 1e-7);
}

/**
 * The part of a range that continues against a bet: its strongest `callFraction` of weight.
 * Facing a bigger bet, fewer hands continue, and the ones that do are stronger.
 */
export function callingRange(range: Range, board: Card[], callFraction: number): Range {
  const f = Math.min(1, Math.max(0.02, callFraction));
  const strengths = boardStrengths(range, board);
  const order = range.map((c, i) => ({ c, s: strengths[i] })).sort((a, b) => b.s - a.s);
  const total = range.reduce((t, c) => t + c.w, 0);
  let budget = total * f;
  const out: Range = [];
  for (const { c } of order) {
    if (budget <= 0) break;
    const w = Math.min(c.w, budget);
    out.push({ ...c, w });
    budget -= w;
  }
  return out;
}

/** Aggregate weights per 169-class for the heatmap (0..1, normalised to max). */
export function rangeGrid(range: Range): Map<string, number> {
  const sum = new Map<string, number>();
  for (const c of range) {
    const cls = handClass(c.a, c.b);
    sum.set(cls, (sum.get(cls) ?? 0) + c.w);
  }
  const out = new Map<string, number>();
  for (const h of HAND_CLASSES) {
    const v = (sum.get(h.cls) ?? 0) / h.combos;
    out.set(h.cls, v);
  }
  const max = Math.max(1e-9, ...out.values());
  for (const [k, v] of out) out.set(k, v / max);
  return out;
}

/** Preflop range width (fraction of hands) from the opponent's preflop action and looseness. */
export function preflopWidth(action: "none" | "limp" | "call" | "open" | "3bet" | "4bet+", looseness = 0.5): number {
  const base = { none: 1, limp: 0.45, call: 0.3, open: 0.22, "3bet": 0.08, "4bet+": 0.03 }[action];
  if (action === "none") return 1;
  // looseness 0.5 = baseline; 1 = twice as wide; 0 = half as wide
  return Math.min(1, base * Math.pow(2, (looseness - 0.5) * 2));
}
