import { describe, expect, it } from "vitest";
import { cards } from "../poker/cards";
import { categoryName, evaluate } from "../poker/evaluator";

const ev = (s: string) => evaluate(cards(s));

describe("evaluator", () => {
  it.each([
    ["As Ks Qs Js Ts 2d 3c", "Straight Flush"],
    ["Ah 2h 3h 4h 5h Kd Kc", "Straight Flush"],
    ["9c 9d 9h 9s 2d 3c 4h", "Four of a Kind"],
    ["Kc Kd Kh 2s 2d 3c 4h", "Full House"],
    ["Ac 9c 7c 4c 2c Kd Qh", "Flush"],
    ["Ad 2c 3h 4s 5d Kd Qh", "Straight"],
    ["7c 7d 7h As 2d 3c 9h", "Three of a Kind"],
    ["7c 7d 5h 5s 2d 3c 9h", "Two Pair"],
    ["7c 7d 5h Ks 2d 3c 9h", "Pair"],
    ["Ac Jd 5h Ks 2d 3c 9h", "High Card"],
  ])("%s is %s", (hand, name) => {
    expect(categoryName(ev(hand))).toBe(name);
  });

  it("ranks categories correctly", () => {
    expect(ev("As Ks Qs Js Ts")).toBeGreaterThan(ev("9c 9d 9h 9s 2d"));
    expect(ev("2c 2d 2h 3s 3d")).toBeGreaterThan(ev("Ac Kc Qc Jc 9c"));
  });

  it("compares kickers", () => {
    expect(ev("Ac Ad Kh 7s 2d")).toBeGreaterThan(ev("Ac Ad Qh 7s 2d"));
    expect(ev("Ac Ad Kh 7s 3d")).toBeGreaterThan(ev("Ac Ad Kh 7s 2d"));
  });

  it("wheel is the lowest straight", () => {
    expect(ev("2c 3d 4h 5s 6d")).toBeGreaterThan(ev("Ac 2d 3h 4s 5d"));
  });

  it("two pair picks best two pairs and kicker from 7 cards", () => {
    expect(ev("Ac Ad Kh Ks 2d 2c Qh")).toBe(ev("Ac Ad Kh Ks Qh"));
  });

  it("full house with two sets uses the higher trips", () => {
    expect(ev("Kc Kd Kh 2s 2d 2c 3h")).toBe(ev("Kc Kd Kh 2s 2d"));
  });

  it("board plays gives a tie", () => {
    expect(ev("2c 3d As Ks Qs Js Ts")).toBe(ev("4c 5d As Ks Qs Js Ts"));
  });
});
