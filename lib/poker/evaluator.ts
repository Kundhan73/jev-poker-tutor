import { Card, rankOf, suitOf } from "./cards";

export const CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

/**
 * Evaluate the best 5-card hand from 5–7 cards.
 * Returns a comparable score: higher is better. category = score >> 20.
 */
export function evaluate(hand: Card[]): number {
  const rankCounts = new Array(13).fill(0);
  const suitCounts = [0, 0, 0, 0];
  const suitMasks = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of hand) {
    const r = rankOf(c);
    const s = suitOf(c);
    rankCounts[r]++;
    suitCounts[s]++;
    suitMasks[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  // Flush / straight flush
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) {
      const sf = straightHigh(suitMasks[s]);
      if (sf >= 0) return pack(8, [sf]);
      return pack(5, topBits(suitMasks[s], 5));
    }
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rankCounts[r] === 4) quads.push(r);
    else if (rankCounts[r] === 3) trips.push(r);
    else if (rankCounts[r] === 2) pairs.push(r);
  }

  if (quads.length) {
    const q = quads[0];
    return pack(7, [q, topBits(rankMask & ~(1 << q), 1)[0]]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(6, [t, p]);
  }
  const st = straightHigh(rankMask);
  if (st >= 0) return pack(4, [st]);
  if (trips.length) {
    const t = trips[0];
    return pack(3, [t, ...topBits(rankMask & ~(1 << t), 2)]);
  }
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return pack(2, [a, b, topBits(rankMask & ~(1 << a) & ~(1 << b), 1)[0]]);
  }
  if (pairs.length) {
    const p = pairs[0];
    return pack(1, [p, ...topBits(rankMask & ~(1 << p), 3)]);
  }
  return pack(0, topBits(rankMask, 5));
}

export const categoryOf = (score: number) => score >> 20;
export const categoryName = (score: number) => CATEGORY_NAMES[categoryOf(score)];

function pack(category: number, kickers: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * 16 + (kickers[i] ?? 0);
  return v;
}

function topBits(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

/** Highest straight top-rank in a 13-bit rank mask, or -1. Handles the wheel (A-5). */
function straightHigh(mask: number): number {
  for (let top = 12; top >= 4; top--) {
    const need = 0b11111 << (top - 4);
    if ((mask & need) === need) return top;
  }
  // Wheel: A,2,3,4,5 -> top is 5 (rank index 3)
  const wheel = (1 << 12) | 0b1111;
  if ((mask & wheel) === wheel) return 3;
  return -1;
}

/** Indices of the winners among the given hands (ties return several). */
export function winners(scores: number[]): number[] {
  const best = Math.max(...scores);
  return scores.flatMap((s, i) => (s === best ? [i] : []));
}
