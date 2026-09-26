import { Card, fullDeck } from "./cards";
import { evaluate } from "./evaluator";
import { Range } from "./ranges";

export interface EquityResult {
  /** Share of the pot won on average, 0..1 (ties counted fractionally). */
  equity: number;
  win: number;
  tie: number;
  iterations: number;
}

/** Cumulative-weight sampler for a range. */
function sampler(range: Range) {
  const cum: number[] = [];
  let t = 0;
  for (const c of range) {
    t += c.w;
    cum.push(t);
  }
  return (rand: () => number) => {
    const x = rand() * t;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < x) lo = m + 1;
      else hi = m;
    }
    return range[lo];
  };
}

/**
 * Monte Carlo equity of `hero` against one range per opponent.
 */
export function equityVsRanges(
  hero: Card[],
  board: Card[],
  opponents: Range[],
  iterations = 4000,
  rand: () => number = Math.random
): EquityResult {
  const dead = new Set([...hero, ...board]);
  const ranges = opponents.map((r) => r.filter((c) => !dead.has(c.a) && !dead.has(c.b) && c.w > 0));
  if (ranges.some((r) => r.length === 0)) return { equity: 1, win: 1, tie: 0, iterations: 0 };
  const samplers = ranges.map(sampler);
  const baseDeck = fullDeck().filter((c) => !dead.has(c));

  let share = 0;
  let wins = 0;
  let ties = 0;
  let done = 0;
  const used = new Uint8Array(52);

  for (let it = 0; it < iterations * 3 && done < iterations; it++) {
    used.fill(0);
    const oppHands: Card[][] = [];
    let ok = true;
    for (const smp of samplers) {
      const c = smp(rand);
      if (used[c.a] || used[c.b]) {
        ok = false;
        break;
      }
      used[c.a] = used[c.b] = 1;
      oppHands.push([c.a, c.b]);
    }
    if (!ok) continue;

    const runout = [...board];
    let guard = 0;
    while (runout.length < 5 && guard++ < 100) {
      const c = baseDeck[Math.floor(rand() * baseDeck.length)];
      if (used[c] || runout.includes(c)) continue;
      runout.push(c);
    }

    const heroScore = evaluate([...hero, ...runout]);
    let best = heroScore;
    let heroTied = 1;
    let heroBest = true;
    for (const h of oppHands) {
      const sc = evaluate([...h, ...runout]);
      if (sc > best) {
        best = sc;
        heroBest = false;
      } else if (sc === best && heroBest) heroTied++;
    }
    if (heroBest) {
      share += 1 / heroTied;
      if (heroTied === 1) wins++;
      else ties++;
    }
    done++;
  }
  return {
    equity: done ? share / done : 0,
    win: done ? wins / done : 0,
    tie: done ? ties / done : 0,
    iterations: done,
  };
}

/** Seeded PRNG (mulberry32) for reproducible tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
