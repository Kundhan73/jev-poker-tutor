import { describe, expect, it } from "vitest";
import { Card, cards, fullDeck } from "../poker/cards";
import { applyAction, buildPots, GameState, legalActions, newHand, pot } from "../game/engine";

const seat = (id: string, stack = 200) => ({ id, name: id, stack, isHuman: false });

/** Build a deck whose front deals the given hole cards (in dealing order) then the board. */
function stackedDeck(holes: string[], board = "2c 3d 4h 5s 7d"): Card[] {
  // Dealing order: one card each round-robin starting left of button, twice.
  const hs = holes.map((h) => cards(h));
  const front: Card[] = [];
  for (let r = 0; r < 2; r++) for (const h of hs) front.push(h[r]);
  const b = cards(board);
  const used = new Set([...front, ...b]);
  const rest = fullDeck().filter((c) => !used.has(c));
  const burn = () => rest.shift()!;
  return [...front, burn(), b[0], b[1], b[2], burn(), b[3], burn(), b[4], ...rest];
}

const totalChips = (s: GameState) => s.players.reduce((t, p) => t + p.stack + (s.handOver ? 0 : p.totalCommitted), 0);

describe("engine", () => {
  it("posts blinds and UTG acts first in 6-max", () => {
    const s = newHand(["a", "b", "c", "d", "e", "f"].map((x) => seat(x)), 0);
    expect(s.players[1].committed).toBe(1);
    expect(s.players[2].committed).toBe(2);
    expect(s.toAct).toBe(3);
    expect(pot(s)).toBe(3);
  });

  it("heads-up: button posts SB and acts first preflop, BB acts first postflop", () => {
    let s = newHand([seat("a"), seat("b")], 0);
    expect(s.players[0].committed).toBe(1);
    expect(s.players[1].committed).toBe(2);
    expect(s.toAct).toBe(0);
    s = applyAction(s, { type: "call" });
    expect(s.toAct).toBe(1); // BB option
    s = applyAction(s, { type: "check" });
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe(1);
  });

  it("enforces min-raise", () => {
    let s = newHand(["a", "b", "c"].map((x) => seat(x)), 0);
    // BTN (seat 0) is first preflop in 3-handed
    expect(s.toAct).toBe(0);
    expect(() => applyAction(s, { type: "raise", amount: 3 })).toThrow();
    s = applyAction(s, { type: "raise", amount: 6 }); // raise of 4
    const l = legalActions(s);
    expect(l.minRaiseTo).toBe(10);
  });

  it("everyone folds to BB: BB wins blinds", () => {
    let s = newHand(["a", "b", "c", "d"].map((x) => seat(x)), 0);
    s = applyAction(s, { type: "fold" });
    s = applyAction(s, { type: "fold" });
    s = applyAction(s, { type: "fold" });
    expect(s.handOver).toBe(true);
    expect(s.players[2].stack).toBe(201);
    expect(s.players[1].stack).toBe(199);
  });

  it("builds side pots with three all-ins of different sizes", () => {
    const players = [
      { id: "a", totalCommitted: 50, folded: false },
      { id: "b", totalCommitted: 100, folded: false },
      { id: "c", totalCommitted: 200, folded: false },
      { id: "d", totalCommitted: 200, folded: false },
      { id: "e", totalCommitted: 20, folded: true },
    ].map((p) => ({ ...p, sittingOut: false })) as never;
    const pots = buildPots(players);
    expect(pots).toEqual([
      { amount: 20 * 5 + 30 * 4, eligible: ["a", "b", "c", "d"] },
      { amount: 50 * 3, eligible: ["b", "c", "d"] },
      { amount: 100 * 2, eligible: ["c", "d"] },
    ]);
  });

  it("pays side pots correctly at showdown after all-ins", () => {
    // seats: 0 BTN(a), 1 SB(b), 2 BB(c). 3-handed: BTN acts first.
    // a has the best hand but shortest stack; b second best; c worst.
    // dealing starts left of button: b, c, a
    let s = newHand([seat("a", 50), seat("b", 100), seat("c", 200)], 0, {
      deck: stackedDeck(["Kc Kd", "7c 8d", "Ac Ad"], "2c 7s 9h Js 3s"),
    });
    s = applyAction(s, { type: "allin" }); // a all-in 50
    s = applyAction(s, { type: "allin" }); // b all-in 100
    s = applyAction(s, { type: "call" }); // c calls 100
    expect(s.handOver).toBe(true);
    // a: AA wins main pot 150; b: KK beats c's 7-pair for side pot 100
    expect(s.players[0].stack).toBe(150);
    expect(s.players[1].stack).toBe(100);
    expect(s.players[2].stack).toBe(100);
    expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(350);
  });

  it("splits a pot when the board plays", () => {
    let s = newHand([seat("a"), seat("b")], 0, {
      deck: stackedDeck(["2c 3c", "2d 3d"], "As Ks Qs Js Ts"),
    });
    s = applyAction(s, { type: "call" });
    s = applyAction(s, { type: "check" });
    while (!s.handOver) s = applyAction(s, { type: "check" });
    expect(s.players[0].stack).toBe(200);
    expect(s.players[1].stack).toBe(200);
  });

  it("conserves chips through random play", () => {
    for (let hand = 0; hand < 300; hand++) {
      let s = newHand(["a", "b", "c", "d", "e", "f"].map((x, i) => seat(x, 50 + i * 37)), hand % 6);
      const start = totalChips(s);
      let guard = 0;
      while (!s.handOver && guard++ < 200) {
        const l = legalActions(s);
        const r = Math.random();
        if (r < 0.2 && l.canFold) s = applyAction(s, { type: "fold" });
        else if (r < 0.35 && l.canRaise) s = applyAction(s, { type: "allin" });
        else if (r < 0.55 && l.canRaise) s = applyAction(s, { type: "raise", amount: l.minRaiseTo });
        else s = applyAction(s, { type: l.canCheck ? "check" : "call" });
      }
      expect(s.handOver).toBe(true);
      expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(start);
    }
  });
});
