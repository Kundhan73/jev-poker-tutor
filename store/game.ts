"use client";
import { create } from "zustand";
import { applyAction, GameState, newHand, PlayerAction, positionName, pot } from "@/lib/game/engine";
import { botDecision, Personality, PROFILES } from "@/lib/game/bots";
import { shuffle } from "@/lib/poker/cards";
import { categoryName, evaluate } from "@/lib/poker/evaluator";
import { rangeGrid } from "@/lib/poker/ranges";
import type { ActionId, ActionOption, SpotFacts } from "@/lib/poker/spot";
import type { EvEstimate } from "@/lib/poker/ev";
import {
  actionLines,
  analyse,
  cardsStr,
  closestOption,
  grade,
  shrinkStyle,
  Grade,
  heuristicRead,
  mathDecision,
} from "@/lib/coach/analysis";
import { emptyStats, type DecideResponse, type ReadRequest, type ReadResponse, type SessionStats } from "@/lib/jev/types";
import type { ClientMessage, RoomView } from "@/lib/room/protocol";

export const HERO_ID = "hero";
const START_STACK = 200;
const BOT_NAMES = ["Ava", "Ben", "Cleo", "Dev", "Eli"];

export interface Seat {
  id: string;
  name: string;
  isHuman: boolean;
  personality?: Personality;
}

export interface Advice {
  step: number;
  facts: SpotFacts;
  menu: ActionOption[];
  equity: number;
  evs: EvEstimate[];
  decision: DecideResponse;
  grids: Record<string, Record<string, number>>;
}

export interface DecisionRecord {
  street: string;
  board: string;
  hole: string;
  facing: string;
  chosen: ActionId;
  chosenLabel: string;
  coachChoice: ActionId;
  coachLabel: string;
  probabilities: Partial<Record<ActionId, number>>;
  equity: number;
  grade: Grade;
  source: "jev" | "math";
}

interface Store {
  seats: Seat[];
  game: GameState | null;
  button: number;
  handNumber: number;
  mode: "coach" | "quiz";
  revealBots: boolean;
  jev: { checked: boolean; available: boolean; model: string | null };
  reads: Record<string, ReadResponse>;
  readPending: Record<string, boolean>;
  stats: Record<string, SessionStats>;
  advice: Advice | null;
  advicePending: boolean;
  decisions: DecisionRecord[];
  history: { hand: number; decisions: DecisionRecord[]; net: number }[];
  selectedOpponent: string | null;
  botDelayMs: number;
  lastError: string | null;
  /** "solo" = local table vs bots; "room" = multiplayer, game state comes from the room server. */
  kind: "solo" | "room";
  /** Engine player id of the person using this browser. */
  heroId: string;
  /** Whether this browser gets Jev coaching (always in solo; host-only in rooms). */
  coachOn: boolean;
  room: RoomView | null;
  /** Server clock minus local clock, for countdowns. */
  clockSkew: number;

  init(): Promise<void>;
  /** Ask the server whether Jev is configured. */
  checkJev(): Promise<void>;
  startHand(): void;
  humanAct(action: PlayerAction, optionId?: ActionId): void;
  setMode(m: "coach" | "quiz"): void;
  toggleReveal(): void;
  selectOpponent(id: string | null): void;
  newSession(): void;
  /** Switch the store into multiplayer mode, sending actions with `send`. */
  enterRoom(send: (msg: ClientMessage) => void): void;
  applyRoomView(view: RoomView): void;
  setCoach(on: boolean): void;
}

const pendingReads = new Map<string, Promise<void>>();
let botTimer: ReturnType<typeof setTimeout> | null = null;
let heroStackAtStart = START_STACK;
let sendToRoom: ((msg: ClientMessage) => void) | null = null;
/** Room mode: history entries already processed (to trigger opponent reads for new actions). */
let seenHistory = 0;
let finishedHand = -1;
/** "hand:step" the latest advice request was made for, so each turn is analysed once. */
let adviceFor = "";

function makeSeats(): Seat[] {
  const personalities = shuffle<Personality>(["rock", "tag", "lag", "station", "maniac"]);
  return [
    { id: HERO_ID, name: "You", isHuman: true },
    ...BOT_NAMES.map((name, i) => ({ id: `bot${i + 1}`, name, isHuman: false, personality: personalities[i] })),
  ];
}

export const useGame = create<Store>((set, get) => {
  // ---------- helpers ----------
  const tick = () => {
    const { game } = get();
    if (!game) return;
    if (game.handOver) return finishHand();
    const p = game.players[game.toAct];
    if (p.id === get().heroId) void requestAdvice();
    else {
      if (botTimer) clearTimeout(botTimer);
      botTimer = setTimeout(botAct, get().botDelayMs);
    }
  };

  const botAct = () => {
    const { game, seats } = get();
    if (!game || game.handOver) return;
    const p = game.players[game.toAct];
    if (p.id === get().heroId) return;
    const seat = seats.find((s) => s.id === p.id)!;
    const action = botDecision(game, PROFILES[seat.personality!]);
    const next = applyAction(game, action);
    set({ game: next });
    void requestRead(p.id);
    tick();
  };

  const baseRead = (id: string, g: GameState): ReadResponse => {
    const h = heuristicRead(get().stats[id] ?? emptyStats(), g, id);
    const prev = get().reads[id];
    // Style reads carry over between hands; hand-specific reads start fresh
    if (prev?.source === "jev") return { ...h, aggression: prev.aggression, looseness: prev.looseness, source: "jev" };
    return h;
  };

  const requestRead = (id: string) => {
    const g = get().game!;
    const fallback = baseRead(id, g);
    if (!get().jev.available) {
      set((st) => ({ reads: { ...st.reads, [id]: fallback } }));
      return Promise.resolve();
    }
    const seatIdx = g.players.findIndex((p) => p.id === id);
    const p = g.players[seatIdx];
    const st = get().stats[id] ?? emptyStats();
    const last = g.history.filter((h) => h.playerId === id).at(-1);
    const body: ReadRequest = {
      opponent: {
        name: p.name,
        position: positionName(g, seatIdx),
        stack: p.stack,
        stats: {
          hands_observed: st.hands,
          vpip_pct: st.hands ? Math.round((100 * st.vpipHands) / st.hands) : 0,
          pfr_pct: st.hands ? Math.round((100 * st.pfrHands) / st.hands) : 0,
          aggression_factor: st.passive ? Math.round((10 * st.aggressive) / st.passive) / 10 : null,
          fold_pct: Math.round((100 * st.folds) / Math.max(1, st.aggressive + st.passive + st.checks + st.folds)),
          recent_showdowns: st.showdowns.slice(-4),
        },
      },
      street: g.street,
      board: cardsStr(g.board),
      pot: pot(g),
      thisHand: actionLines(g),
      lastWasAggressive: !!last && ["bet", "raise", "allin"].includes(last.type),
    };
    set((s) => ({ readPending: { ...s.readPending, [id]: true } }));
    const promise = fetch("/api/read-opponent", { method: "POST", body: JSON.stringify(body) })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
        return (await r.json()) as ReadResponse;
      })
      .then((read) => set((s) => ({ reads: { ...s.reads, [id]: shrinkStyle(read, st.hands) }, lastError: null })))
      .catch((e: Error) => set((s) => ({ reads: { ...s.reads, [id]: fallback }, lastError: `Jev read failed: ${e.message}` })))
      .finally(() => {
        set((s) => ({ readPending: { ...s.readPending, [id]: false } }));
        pendingReads.delete(id);
      });
    pendingReads.set(id, promise);
    return promise;
  };

  const requestAdvice = async () => {
    const g0 = get().game!;
    const step = g0.history.length;
    const key = `${g0.handNumber}:${step}`;
    adviceFor = key;
    const stale = () => {
      const g = get().game;
      return !g || g.handOver || `${g.handNumber}:${g.history.length}` !== key;
    };
    set({ advicePending: true });
    // Wait (briefly) for opponent reads still in flight, so the decision uses the freshest reads
    await Promise.race([Promise.allSettled([...pendingReads.values()]), new Promise((r) => setTimeout(r, 3000))]);
    if (stale()) return adviceFor === key && set({ advicePending: false });
    const g = get().game!;
    const heroSeat = g.players.findIndex((p) => p.id === get().heroId);
    if (heroSeat < 0) return set({ advicePending: false });
    const reads: Record<string, ReadResponse> = {};
    for (const p of g.players) if (p.id !== get().heroId) reads[p.id] = get().reads[p.id] ?? baseRead(p.id, g);

    // Let the UI paint "thinking" before the synchronous equity crunch
    await new Promise((r) => setTimeout(r, 16));
    const a = analyse(g, heroSeat, reads);
    let decision = mathDecision(a);
    if (get().jev.available) {
      try {
        const r = await fetch("/api/decide", { method: "POST", body: JSON.stringify(a.request) });
        if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
        decision = (await r.json()) as DecideResponse;
        set({ lastError: null });
      } catch (e) {
        set({ lastError: `Jev decision failed, using math engine: ${(e as Error).message}` });
      }
    }
    if (stale()) return adviceFor === key && set({ advicePending: false });
    const grids: Advice["grids"] = {};
    for (const [id, r] of Object.entries(a.ranges)) grids[id] = Object.fromEntries(rangeGrid(r));
    set({
      advicePending: false,
      advice: { step, facts: a.facts, menu: a.menu, equity: a.equity, evs: a.evs, decision, grids },
    });
  };

  const finishHand = () => {
    const { game, stats } = get();
    if (!game) return;
    const next = { ...stats };
    for (const p of game.players) {
      if (p.sittingOut) continue;
      const s = { ...(next[p.id] ?? emptyStats()), showdowns: [...(next[p.id]?.showdowns ?? [])] };
      const mine = game.history.filter((h) => h.playerId === p.id);
      s.hands++;
      const pre = mine.filter((h) => h.street === "preflop");
      if (pre.some((h) => ["call", "raise", "bet", "allin"].includes(h.type))) s.vpipHands++;
      if (pre.some((h) => ["raise", "bet"].includes(h.type) || (h.type === "allin" && h.to > game.bb))) s.pfrHands++;
      for (const h of mine) {
        if (h.type === "bet" || h.type === "raise" || h.type === "allin") s.aggressive++;
        else if (h.type === "call") s.passive++;
        else if (h.type === "check") s.checks++;
        else if (h.type === "fold") s.folds++;
      }
      if (game.street === "showdown" && !p.folded) {
        const lastAgg = mine.filter((h) => ["bet", "raise", "allin"].includes(h.type)).at(-1);
        s.showdowns.push(
          `${cardsStr(p.hole)} (${categoryName(evaluate([...p.hole, ...game.board]))})${lastAgg ? ` after betting the ${lastAgg.street}` : " after only calling/checking"}`
        );
      }
      next[p.id] = s;
    }
    const hero = game.players.find((p) => p.id === get().heroId);
    if (!hero) return set({ stats: next, advice: null, advicePending: false });
    const record = { hand: game.handNumber, decisions: get().decisions, net: hero.stack - heroStackAtStart };
    set({ stats: next, advice: null, advicePending: false, history: [...get().history, record].slice(-50) });
  };

  return {
    seats: makeSeats(),
    game: null,
    button: 0,
    handNumber: 0,
    mode: "coach",
    revealBots: false,
    jev: { checked: false, available: false, model: null },
    reads: {},
    readPending: {},
    stats: {},
    advice: null,
    advicePending: false,
    decisions: [],
    history: [],
    selectedOpponent: null,
    botDelayMs: 750,
    lastError: null,
    kind: "solo",
    heroId: HERO_ID,
    coachOn: true,
    room: null,
    clockSkew: 0,

    async init() {
      if (get().kind === "room") {
        // Coming back from a room: reset to a fresh solo table
        sendToRoom = null;
        set({ kind: "solo", heroId: HERO_ID, coachOn: true, room: null, game: null, seats: makeSeats(), stats: {}, reads: {}, history: [], decisions: [], handNumber: 0, advice: null });
      }
      await get().checkJev();
      if (!get().game) get().startHand();
    },

    async checkJev() {
      try {
        const r = await fetch("/api/status");
        const j = await r.json();
        set({ jev: { checked: true, available: !!j.jev, model: j.model } });
      } catch {
        set({ jev: { checked: true, available: false, model: null } });
      }
    },

    startHand() {
      if (botTimer) clearTimeout(botTimer);
      const { seats, game, button, handNumber } = get();
      const stacks = new Map(game?.players.map((p) => [p.id, p.stack]) ?? []);
      // Cash game: anyone who busted auto-rebuys to 100 big blinds
      const seatInfo = seats.map((s) => ({
        id: s.id,
        name: s.name,
        isHuman: s.isHuman,
        stack: (stacks.get(s.id) ?? START_STACK) > 0 ? (stacks.get(s.id) ?? START_STACK) : START_STACK,
      }));
      const nextButton = game ? (button + 1) % seats.length : Math.floor(Math.random() * seats.length);
      const g = newHand(seatInfo, nextButton, { handNumber: handNumber + 1 });
      heroStackAtStart = seatInfo.find((s) => s.id === HERO_ID)!.stack;
      const reads: Record<string, ReadResponse> = {};
      for (const p of g.players) if (p.id !== HERO_ID) reads[p.id] = baseRead(p.id, g);
      set({ game: g, button: g.button, handNumber: handNumber + 1, decisions: [], advice: null, reads });
      tick();
    },

    humanAct(action, optionId) {
      const { game, advice } = get();
      if (!game || game.handOver || game.players[game.toAct]?.id !== get().heroId) return;
      const menuOpt = advice?.menu.find((o) => o.id === optionId);
      const chosen: ActionId =
        optionId ??
        (action.type === "allin"
          ? "all_in"
          : action.amount !== undefined && advice
            ? closestOption(advice.menu, action.amount, game.players[game.toAct].committed + game.players[game.toAct].stack)
            : (action.type as ActionId));
      if (advice && advice.step === game.history.length) {
        const hero = game.players[game.toAct];
        const last = game.history.filter((h) => h.street === game.street && h.playerId !== hero.id).at(-1);
        const rec: DecisionRecord = {
          street: game.street,
          board: cardsStr(game.board),
          hole: cardsStr(hero.hole),
          facing: advice.facts.toCall > 0 ? `${advice.facts.toCall} to call into ${advice.facts.pot}` : last ? "checked to you" : "first to act",
          chosen,
          chosenLabel: menuOpt?.label ?? (action.amount ? `Raise to ${action.amount}` : action.type),
          coachChoice: advice.decision.choice,
          coachLabel: advice.menu.find((o) => o.id === advice.decision.choice)?.label ?? advice.decision.choice,
          probabilities: advice.decision.probabilities,
          equity: advice.equity,
          grade: grade(advice.decision.probabilities, chosen),
          source: advice.decision.source,
        };
        set({ decisions: [...get().decisions, rec] });
      }
      if (get().kind === "room") {
        // The room server is authoritative: send the action and wait for the new state
        sendToRoom?.({ type: "act", action });
        set({ advice: null });
        return;
      }
      set({ game: applyAction(game, action), advice: null });
      tick();
    },

    setMode: (m) => set({ mode: m }),
    toggleReveal: () => set((s) => ({ revealBots: !s.revealBots })),
    selectOpponent: (id) => set({ selectedOpponent: id }),
    enterRoom(send) {
      if (botTimer) clearTimeout(botTimer);
      sendToRoom = send;
      seenHistory = 0;
      finishedHand = -1;
      set({
        kind: "room",
        game: null,
        room: null,
        seats: [],
        stats: {},
        reads: {},
        history: [],
        decisions: [],
        advice: null,
        coachOn: false,
        revealBots: false,
      });
    },

    applyRoomView(view) {
      const prev = get().game;
      const heroId = view.mySeatId ?? "__spectator__";
      const isHost = !!view.mySeatId && view.mySeatId === view.hostSeatId;
      const mySeat = view.seats.find((s) => s?.seatId === view.mySeatId);
      const coachOn = isHost && !!mySeat?.coached;
      const seats: Seat[] = view.seats
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ id: s.seatId, name: s.name, isHuman: !s.isBot, personality: s.personality }));
      set({ room: view, heroId, coachOn, seats, clockSkew: view.serverNow - Date.now() });

      const g = view.game;
      if (!g) return set({ game: null });
      if (!prev || prev.handNumber !== g.handNumber) {
        // New hand: reset per-hand coaching state
        seenHistory = 0;
        const hero = g.players.find((p) => p.id === heroId);
        heroStackAtStart = hero ? hero.stack + hero.totalCommitted : 0;
        set({ game: g, decisions: [], advice: null, advicePending: false });
        const reads: Record<string, ReadResponse> = {};
        for (const p of g.players) if (p.id !== heroId) reads[p.id] = baseRead(p.id, g);
        set({ reads });
      } else set({ game: g });

      if (coachOn) {
        // Ask Jev for fresh reads on anyone who acted since the last update
        const fresh = g.history.slice(seenHistory).filter((h) => h.playerId !== heroId && h.type !== "sb" && h.type !== "bb");
        for (const id of new Set(fresh.map((h) => h.playerId))) void requestRead(id);
      }
      seenHistory = g.history.length;

      if (g.handOver) {
        if (finishedHand !== g.handNumber) {
          finishedHand = g.handNumber;
          finishHand();
        }
        return;
      }
      const heroTurn = g.players[g.toAct]?.id === heroId;
      if (coachOn && heroTurn && adviceFor !== `${g.handNumber}:${g.history.length}`) void requestAdvice();
      if (!heroTurn && get().advice) set({ advice: null });
    },

    setCoach(on) {
      sendToRoom?.({ type: "coach", on });
    },

    newSession() {
      if (botTimer) clearTimeout(botTimer);
      set({ seats: makeSeats(), game: null, stats: {}, reads: {}, history: [], decisions: [], handNumber: 0, advice: null });
      get().startHand();
    },
  };
});

