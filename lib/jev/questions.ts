import { choice, noul, score } from "@typesafe-ai/sdk";
import type { ActionId } from "../poker/spot";
import type { DecideRequest, ReadRequest } from "./types";

export const AGGRESSION_RUBRIC = [
  "Very passive: almost only checks and calls, rarely bets or raises",
  "Somewhat passive: bets mainly with strong hands",
  "Balanced: mixes betting and calling in normal proportions",
  "Aggressive: bets and raises often, including semi-bluffs",
  "Maniac: bets and raises relentlessly with almost any holding",
] as const;

export const LOOSENESS_RUBRIC = [
  "Very tight: plays only premium starting hands (under 15% of hands)",
  "Tight: selective, around 15-22% of hands",
  "Standard: around 22-30% of hands",
  "Loose: plays many speculative hands, around 30-45%",
  "Very loose: plays most hands dealt (over 45%)",
] as const;

export const RANGE_STRENGTH_RUBRIC = [
  "Very weak / wide: mostly air, draws that missed, or bottom of range",
  "Weak: weak pairs and draws",
  "Medium: one decent pair or a good draw",
  "Strong: top pair good kicker, overpair, or two pair",
  "Very strong: sets, straights, flushes or better",
] as const;

/** Map a zero-indexed expected score onto 0..1. */
export const normScore = (s: number, levels: number) => Math.min(1, Math.max(0, s / (levels - 1)));

export function readQuestions(req: ReadRequest) {
  const qs = {
    aggression: score(
      "Judging from this opponent's session statistics and the actions they have taken, how aggressive is their playing style?",
      AGGRESSION_RUBRIC
    ),
    looseness: score(
      "How loose is this opponent preflop, i.e. how wide a range of starting hands do they play?",
      LOOSENESS_RUBRIC
    ),
    range_strength: score(
      "Given everything this opponent has done in the current hand (bet sizes, timing of aggression, board texture) and their style, how strong is the hand they are most likely holding right now?",
      RANGE_STRENGTH_RUBRIC
    ),
  };
  if (!req.lastWasAggressive) return qs;
  return {
    ...qs,
    bluffing: noul(
      "Is this opponent's most recent bet or raise more likely a bluff or semi-bluff with a weak hand than a value bet with a strong hand?",
      {
        true: "Bluff: weak hand or draw trying to make better hands fold",
        false: "Value: a strong made hand hoping to get called by worse",
      }
    ),
  };
}

const ACTION_MEANING: Record<ActionId, string> = {
  fold: "Give up the hand and forfeit the chips already in the pot",
  check: "Pass the action without putting in more chips",
  call: "Match the current bet to continue",
  raise_small: "Small bet/raise (about one third of the pot, or a min-sized open preflop)",
  raise_medium: "Medium bet/raise (about two thirds of the pot, or a standard open/3-bet preflop)",
  raise_big: "Large bet/raise (about pot size, or an oversized raise preflop)",
  all_in: "Move all remaining chips into the pot",
};

export function decisionQuestion(req: DecideRequest) {
  const criteria: Record<string, string> = {};
  for (const o of req.options) criteria[o.id] = `${o.label} — ${ACTION_MEANING[o.id]}. Adds ${o.cost} chips.`;
  return {
    action: choice(
      "You are an expert No-Limit Hold'em coach. Choose the action for the hero that maximises long-run expected winnings, considering hand strength, equity against the opponents' likely ranges, pot odds, fold equity, stack depth and each opponent's tendencies.",
      criteria as Record<ActionId, string>
    ),
  };
}

/** The `state` payload sent to Jev for a decision. Kept compact and self-describing. */
export function decisionState(req: DecideRequest) {
  return {
    game: "No-Limit Texas Hold'em cash game, 6-max, blinds 1/2",
    hero: req.hero,
    street: req.street,
    board: req.board || "(none yet)",
    pot: req.pot,
    to_call: req.toCall,
    pot_odds_pct: req.potOdds === null ? null : Math.round(req.potOdds * 1000) / 10,
    stack_to_pot_ratio: Math.round(req.spr * 10) / 10,
    board_texture: req.texture,
    hero_equity_vs_estimated_ranges_pct: Math.round(req.equity * 1000) / 10,
    opponents_in_hand: req.opponents.map((o) => ({
      name: o.name,
      position: o.position,
      stack: o.stack,
      read: {
        aggression: pct(o.read.aggression),
        looseness: pct(o.read.looseness),
        current_hand_strength: pct(o.read.rangeStrength),
        bluff_probability: pct(o.read.bluffing),
      },
      actions_this_hand: o.thisHand,
    })),
    action_history: req.history.map((h) => `${h.street}: ${h.player} ${h.action}${h.amount ? " " + h.amount : ""} (pot ${h.potAfter})`),
    math_engine_estimates: req.options.map((o) => ({
      action: o.id,
      label: o.label,
      estimated_ev_chips: Math.round(o.evChips * 10) / 10,
      ...(o.foldEquity !== undefined ? { fold_equity_pct: pct(o.foldEquity) } : {}),
      ...(o.equityIfCalled !== undefined ? { hero_equity_if_called_pct: pct(o.equityIfCalled) } : {}),
    })),
  };
}

export function readState(req: ReadRequest) {
  return {
    game: "No-Limit Texas Hold'em cash game, 6-max, blinds 1/2",
    opponent: req.opponent,
    street: req.street,
    board: req.board || "(none yet)",
    pot: req.pot,
    actions_this_hand: req.thisHand.map((h) => `${h.street}: ${h.player} ${h.action}${h.amount ? " " + h.amount : ""}`),
  };
}

const pct = (x: number) => Math.round(x * 100) + "%";
