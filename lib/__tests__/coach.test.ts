import { describe, expect, it } from "vitest";
import { cards, fullDeck } from "../poker/cards";
import { equityVsRanges, seeded } from "../poker/equity";
import { allCombos, classPercentile, HAND_CLASSES, narrowRange, NEUTRAL_READ, Range, topPercentRange } from "../poker/ranges";
import { applyAction, newHand } from "../game/engine";
import { botDecision, PROFILES } from "../game/bots";
import { actionMenu } from "../poker/spot";
import { analyse, grade, heuristicRead, mathDecision, shrinkStyle } from "../coach/analysis";
import { estimateEvs } from "../poker/ev";
import { bluffShare, callingRange, preflopWidth } from "../poker/ranges";
import { foldProbability } from "../poker/ev";
import { emptyStats } from "../jev/types";

const single = (s: string): Range => {
  const [a, b] = cards(s);
  return [{ a, b, w: 1 }];
};

describe("ranges", () => {
  it("has 169 classes covering 1326 combos, with AA strongest", () => {
    expect(HAND_CLASSES).toHaveLength(169);
    expect(HAND_CLASSES.reduce((t, h) => t + h.combos, 0)).toBe(1326);
    expect(HAND_CLASSES[0].cls).toBe("AA");
    expect(classPercentile("AA")).toBeLessThan(classPercentile("72o"));
  });

  it("top 10% range contains premium hands but not trash", () => {
    const r = topPercentRange(0.1);
    const has = (x: string) => r.some((c) => c.w > 0.5 && cards(x).every((k) => k === c.a || k === c.b));
    expect(has("As Ah")).toBe(true);
    expect(has("7c 2d")).toBe(false);
  });

  it("strong read shifts weight towards made hands", () => {
    const board = cards("Ah 7c 2d");
    const r = allCombos(board);
    const strong = narrowRange(r, board, { ...NEUTRAL_READ, rangeStrength: 1, bluffing: 0 });
    const w = (rng: Range, s: string) => {
      const [a, b] = cards(s);
      return rng.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))?.w ?? 0;
    };
    expect(w(strong, "7h 7d")).toBeGreaterThan(w(strong, "9s 8s") * 10);
  });
});

describe("equity", () => {
  it("AA vs KK preflop is about 82%", () => {
    const r = equityVsRanges(cards("As Ah"), [], [single("Ks Kh")], 20000, seeded(7));
    expect(r.equity).toBeGreaterThan(0.8);
    expect(r.equity).toBeLessThan(0.84);
  });

  it("made nut flush on the river is 100% vs a pair", () => {
    const r = equityVsRanges(cards("Ah Kh"), cards("2h 7h 9h Jc 3d"), [single("Jd Js")], 200, seeded(1));
    expect(r.equity).toBe(1);
  });

  it("identical hands split", () => {
    const r = equityVsRanges(cards("As Kd"), cards("2c 7d 9h"), [single("Ac Kh")], 5000, seeded(3));
    expect(r.equity).toBeGreaterThan(0.45);
    expect(r.equity).toBeLessThan(0.55);
  });
});

describe("bots", () => {
  it("every personality plays full hands without illegal actions", () => {
    const rand = seeded(42);
    const profiles = Object.values(PROFILES);
    let stacks = [200, 200, 200, 200, 200, 200];
    for (let hand = 0; hand < 60; hand++) {
      stacks = stacks.map((s) => (s <= 0 ? 200 : s));
      let g = newHand(
        stacks.map((stack, i) => ({ id: `p${i}`, name: `p${i}`, stack, isHuman: false })),
        hand % 6
      );
      let guard = 0;
      while (!g.handOver && guard++ < 100) g = applyAction(g, botDecision(g, profiles[g.toAct % 5], rand));
      expect(g.handOver).toBe(true);
      stacks = g.players.map((p) => p.stack);
    }
  });
});

describe("coach", () => {
  it("math coach never folds the nuts facing a bet", () => {
    // Hero (seat 1, BB heads-up) holds AA; villain shoves preflop.
    let g = newHand(
      [
        { id: "v", name: "V", stack: 200, isHuman: false },
        { id: "hero", name: "You", stack: 200, isHuman: true },
      ],
      0,
      // Deal order is hero, villain, hero, villain: hero gets AA, villain KK
      { deck: [...cards("As Ks Ah Kd"), ...fullDeck().filter((c) => !cards("As Ks Ah Kd").includes(c))] }
    );
    g = applyAction(g, { type: "allin" });
    const reads = { v: heuristicRead(emptyStats(), g, "v") };
    const a = analyse(g, 1, reads);
    expect(a.equity).toBeGreaterThan(0.6);
    const d = mathDecision(a);
    expect(d.choice).not.toBe("fold");
    expect(actionMenu(g).map((o) => o.id)).toContain("call");
  });

  it("grades relative to the top action", () => {
    const probs = { fold: 0.05, call: 0.6, raise_medium: 0.35 };
    expect(grade(probs, "call")).toBe("Best");
    expect(grade(probs, "raise_medium")).toBe("Good");
    expect(grade(probs, "fold")).toBe("Mistake");
  });
});

describe("regressions", () => {
  // Hand #2 of the first live session: 6h3s facing a big turn bet. A coin-flip "is it a bluff?"
  // read (0.55) used to turn the villain's range into 55% air, giving 52% equity and a raise.
  it("a 50/50 bluff read doesn't make bottom pair a raise", () => {
    const hero = cards("6h 3s");
    const board = cards("3d 7d 8s Th");
    const pre = topPercentRange(preflopWidth("open", 0.33), [...hero, ...board]);
    const read = { aggression: 0.71, rangeStrength: 0.7, bluffing: 0.55 };
    const eq = equityVsRanges(hero, board, [narrowRange(pre, board, read)], 20000, seeded(1)).equity;
    const eqCalled = equityVsRanges(hero, board, [narrowRange(pre, board, read, true)], 20000, seeded(1)).equity;
    expect(eq).toBeLessThan(0.42);
    const opts = [
      { id: "fold", label: "Fold", action: { type: "fold" }, cost: 0 },
      { id: "call", label: "Call 58", action: { type: "call" }, cost: 58 },
      { id: "raise_medium", label: "Raise to 116", action: { type: "raise", amount: 116 }, cost: 116, potFraction: 0.33 },
    ] as never;
    const evs = estimateEvs(opts, 116, eq, Math.min(eq, eqCalled), [read]);
    expect(evs.find((e) => e.id === "raise_medium")!.ev).toBeLessThan(0);
  });

  it("bluff share stays within realistic frequencies", () => {
    expect(bluffShare(0)).toBeGreaterThanOrEqual(0.05);
    expect(bluffShare(0.55)).toBeLessThan(0.3);
    expect(bluffShare(1)).toBeLessThanOrEqual(0.4);
  });

  it("style reads from two hands stay near neutral", () => {
    const r = shrinkStyle({ aggression: 0.01, looseness: 0.97 }, 2);
    expect(r.aggression).toBeGreaterThan(0.35);
    expect(r.looseness).toBeLessThan(0.65);
  });

  // Room test hand #1: 6c8s on Qd 7s 5s 8d (pair + open-ender), checked to us, pot 33, 184 behind.
  // Assuming the same calling range for every size used to make a 5.5x-pot shove look best.
  it("an overbet shove is judged against the strong hands that call it", () => {
    const hero = cards("6c 8s");
    const board = cards("Qd 7s 5s 8d");
    const read = { aggression: 0.5, rangeStrength: 0.55, bluffing: 0.2 };
    const range = narrowRange(topPercentRange(1, [...hero, ...board]), board, read);
    const rand = seeded(5);
    const eq = equityVsRanges(hero, board, [range], 8000, rand).equity;
    const opt = (id: string, cost: number) =>
      ({ id, label: id, action: { type: "bet", amount: cost }, cost, potFraction: cost / 33 }) as never;
    const opts = [{ id: "check", label: "Check", action: { type: "check" }, cost: 0 } as never, opt("raise_medium", 22), opt("all_in", 184)];
    const eqCalled = (o: { potFraction?: number }) =>
      Math.min(eq, equityVsRanges(hero, board, [callingRange(range, board, 1 - foldProbability(o.potFraction ?? 1, read))], 8000, rand).equity);
    const evs = estimateEvs(opts, 33, eq, eqCalled, [read]);
    const ev = (id: string) => evs.find((e) => e.id === id)!.ev;
    expect(ev("all_in")).toBeLessThan(Math.max(ev("check"), ev("raise_medium")));
    expect(evs.find((e) => e.id === "all_in")!.equityIfCalled!).toBeLessThan(evs.find((e) => e.id === "raise_medium")!.equityIfCalled!);
  });

  // Room test hand #2: KcKh on 8h 6s 5s, pot 5, 215 behind. A 43x-pot shove only gets called
  // by the few hands that beat us, so a normal-sized bet (or check) must rate higher.
  it("pocket kings don't shove 43x the pot on the flop", () => {
    const hero = cards("Kh Kc");
    const board = cards("8h 6s 5s");
    const read = { aggression: 0.5, rangeStrength: 0.35, bluffing: 0.2 };
    const range = narrowRange(topPercentRange(1, [...hero, ...board]), board, read);
    const rand = seeded(9);
    const eq = equityVsRanges(hero, board, [range], 8000, rand).equity;
    const opt = (id: string, cost: number) =>
      ({ id, label: id, action: { type: "bet", amount: cost }, cost, potFraction: cost / 5 }) as never;
    const opts = [{ id: "check", label: "Check", action: { type: "check" }, cost: 0 } as never, opt("raise_small", 2), opt("raise_big", 5), opt("all_in", 215)];
    const eqCalled = (o: { potFraction?: number }) =>
      Math.min(eq, equityVsRanges(hero, board, [callingRange(range, board, 1 - foldProbability(o.potFraction ?? 1, read))], 8000, rand).equity);
    const evs = estimateEvs(opts, 5, eq, eqCalled, [read]);
    const best = evs.reduce((a, b) => (b.ev > a.ev ? b : a));
    expect(best.id).not.toBe("all_in");
    expect(foldProbability(43, read)).toBeGreaterThan(0.95);
    expect(foldProbability(1, read)).toBeGreaterThan(0.3);
    expect(foldProbability(1, read)).toBeLessThan(0.7);
  });
});
