import { GameState, PlayerAction, pot } from "./engine";
import { actionMenu, ActionOption } from "../poker/spot";
import { allCombos, classPercentile, handClass, Range } from "../poker/ranges";
import { equityVsRanges } from "../poker/equity";

export type Personality = "rock" | "tag" | "lag" | "station" | "maniac";

export interface BotProfile {
  personality: Personality;
  label: string;
  blurb: string;
  /** Fraction of hands voluntarily played preflop. */
  vpip: number;
  /** Fraction of hands raised preflop. */
  pfr: number;
  /** How often the bot takes the aggressive line with a decent hand, 0..1. */
  aggression: number;
  /** How often it bluffs with nothing, 0..1. */
  bluff: number;
  /** Willingness to call down with marginal hands, 0..1. */
  stickiness: number;
}

export const PROFILES: Record<Personality, BotProfile> = {
  rock: {
    personality: "rock",
    label: "Rock",
    blurb: "Tight and passive. Only plays premium hands and rarely bluffs.",
    vpip: 0.14,
    pfr: 0.08,
    aggression: 0.3,
    bluff: 0.03,
    stickiness: 0.25,
  },
  tag: {
    personality: "tag",
    label: "TAG",
    blurb: "Tight-aggressive. Solid regular: selective, but bets hard with good hands.",
    vpip: 0.22,
    pfr: 0.18,
    aggression: 0.65,
    bluff: 0.12,
    stickiness: 0.4,
  },
  lag: {
    personality: "lag",
    label: "LAG",
    blurb: "Loose-aggressive. Plays many hands and applies constant pressure.",
    vpip: 0.38,
    pfr: 0.3,
    aggression: 0.75,
    bluff: 0.25,
    stickiness: 0.5,
  },
  station: {
    personality: "station",
    label: "Calling Station",
    blurb: "Loose-passive. Calls far too often and almost never folds a pair.",
    vpip: 0.55,
    pfr: 0.06,
    aggression: 0.12,
    bluff: 0.02,
    stickiness: 0.92,
  },
  maniac: {
    personality: "maniac",
    label: "Maniac",
    blurb: "Hyper-aggressive. Bets and raises almost anything.",
    vpip: 0.7,
    pfr: 0.55,
    aggression: 0.9,
    bluff: 0.45,
    stickiness: 0.7,
  },
};

const RANDOM_RANGE: Range = allCombos();

const pick = (menu: ActionOption[], ...ids: string[]) => {
  for (const id of ids) {
    const o = menu.find((m) => m.id === id);
    if (o) return o.action;
  }
  return null;
};

const passive = (menu: ActionOption[]): PlayerAction => pick(menu, "check", "fold")!;

function aggressiveIds(profile: BotProfile, rand: () => number): string[] {
  const r = rand();
  if (profile.aggression > 0.7) return r < 0.5 ? ["raise_big", "raise_medium", "all_in"] : ["raise_medium", "raise_big", "all_in"];
  if (profile.aggression < 0.35) return ["raise_small", "raise_medium", "all_in"];
  return r < 0.6 ? ["raise_medium", "raise_small", "all_in"] : ["raise_big", "raise_medium", "all_in"];
}

/** Choose an action for the bot at `s.toAct`. Rule-based with randomness. */
export function botDecision(s: GameState, profile: BotProfile, rand: () => number = Math.random): PlayerAction {
  const seat = s.toAct;
  const me = s.players[seat];
  const menu = actionMenu(s);
  const toCall = Math.min(s.currentBet - me.committed, me.stack);
  const potNow = pot(s);

  const aggressive = () => {
    const a = pick(menu, ...aggressiveIds(profile, rand));
    return a ?? pick(menu, "call", "check")!;
  };
  const callOr = (fallback: PlayerAction) => pick(menu, "call", "check") ?? fallback;

  if (s.street === "preflop") {
    const pct = classPercentile(handClass(me.hole[0], me.hole[1]));
    const raises = s.history.filter((h) => h.street === "preflop" && (h.type === "raise" || h.type === "allin" || h.type === "bet")).length;
    const jitter = (rand() - 0.5) * 0.06;
    const p = pct + jitter;
    if (raises === 0) {
      if (p < profile.pfr) return aggressive();
      if (p < profile.vpip) return callOr(passive(menu));
      return passive(menu);
    }
    // Facing a raise: tighten up, more for each re-raise and for big price relative to stack
    const tighten = Math.pow(0.4, raises - 1);
    const expensive = toCall > me.stack * 0.3 ? 0.4 : 1;
    if (p < profile.pfr * 0.3 * tighten * expensive + (pct < 0.02 ? 1 : 0)) return aggressive();
    if (p < (profile.vpip * 0.5 + profile.stickiness * 0.1) * tighten * expensive) return callOr(passive(menu));
    return passive(menu);
  }

  // Postflop: equity against random hands for each live opponent
  const opps = s.players.filter((o, i) => i !== seat && !o.folded && !o.sittingOut).length;
  const eq = equityVsRanges(
    me.hole,
    s.board,
    Array.from({ length: opps }, () => RANDOM_RANGE),
    250,
    rand
  ).equity;
  // Normalise equity for number of opponents so thresholds mean "relative strength"
  const strength = Math.min(1, eq * (opps + 1) * 0.5 + (opps > 1 ? 0.05 : 0));

  if (toCall === 0) {
    if (strength > 0.75 && rand() < profile.aggression + 0.25) return aggressive();
    if (strength > 0.5 && rand() < profile.aggression * 0.6) return aggressive();
    if (rand() < profile.bluff) return aggressive();
    return passive(menu);
  }

  const potOdds = toCall / (potNow + toCall);
  if (strength > 0.82 && rand() < profile.aggression) return aggressive();
  const needed = potOdds * (1.25 - 0.7 * profile.stickiness);
  if (eq > needed || (strength > 0.55 && rand() < profile.stickiness)) return callOr(passive(menu));
  if (rand() < profile.bluff * 0.25) return aggressive();
  return passive(menu);
}
