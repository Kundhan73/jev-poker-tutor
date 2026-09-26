import { Connection, ConnectionContext, routePartykitRequest, Server, WSMessage } from "partyserver";
import { applyAction, GameState, legalActions, newHand, PlayerAction } from "../lib/game/engine";
import { botDecision, Personality, PROFILES } from "../lib/game/bots";
import { shuffle } from "../lib/poker/cards";
import {
  ClientMessage,
  MAX_SEATS,
  redactGame,
  RoomSeat,
  RoomView,
  ServerMessage,
  START_STACK,
  TURN_SECONDS,
} from "../lib/room/protocol";

export interface Env {
  PokerRoom: DurableObjectNamespace<PokerRoom>;
  [key: string]: unknown;
}

interface SeatRecord extends RoomSeat {
  stack: number;
  /** Consecutive turns timed out; two in a row sits the player out. */
  timeouts: number;
}

interface RoomData {
  seats: (SeatRecord | null)[];
  /** Secret player token → public seat id. Never sent to clients. */
  tokens: Record<string, string>;
  hostSeatId: string | null;
  started: boolean;
  game: GameState | null;
  buttonSeatId: string | null;
  handNumber: number;
  turnDeadline: number | null;
  nextHandAt: number | null;
  /** history length when the current turn began, so a new turn gets a fresh deadline */
  turnKey: string | null;
}

interface ConnState {
  token: string;
}

const BOT_NAMES = ["Ava", "Ben", "Cleo", "Dev", "Eli", "Fay"];
const BOT_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 5000;
const AWAY_ACT_DELAY_MS = 700;

const emptyRoom = (): RoomData => ({
  seats: Array(MAX_SEATS).fill(null),
  tokens: {},
  hostSeatId: null,
  started: false,
  game: null,
  buttonSeatId: null,
  handNumber: 0,
  turnDeadline: null,
  nextHandAt: null,
  turnKey: null,
});

const newId = () => crypto.randomUUID().slice(0, 8);

export class PokerRoom extends Server<Env> {
  static options = { hibernate: true };
  room: RoomData = emptyRoom();

  async onStart() {
    this.room = (await this.ctx.storage.get<RoomData>("room")) ?? emptyRoom();
    // After a restart, trust only sockets that are actually still open for "connected"
    const live = new Set([...this.getConnections<ConnState>()].map((c) => c.state?.token));
    for (const [token, seatId] of Object.entries(this.room.tokens)) {
      const seat = this.seatById(seatId);
      if (seat && !seat.isBot) seat.connected = live.has(token);
    }
  }

  // ---------- connection lifecycle ----------

  onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get("token") ?? "";
    if (token.length < 16) {
      conn.close(4000, "missing token");
      return;
    }
    conn.setState({ token });
    const seat = this.seatByToken(token);
    if (seat) {
      seat.connected = true;
      if (seat.away && seat.timeouts === 0) seat.away = false;
    }
    void this.commit();
  }

  onClose(conn: Connection<ConnState>) {
    const token = conn.state?.token;
    if (!token) return;
    const seat = this.seatByToken(token);
    // Only mark disconnected if this was their last open tab
    const stillOpen = [...this.getConnections<ConnState>()].some((c) => c !== conn && c.state?.token === token);
    if (seat && !stillOpen) {
      seat.connected = false;
      void this.commit();
    }
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    const token = conn.state?.token;
    if (!token || typeof raw !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      this.handle(token, msg);
      await this.commit();
    } catch (e) {
      this.send(conn, { type: "error", message: (e as Error).message });
    }
  }

  // ---------- actions ----------

  private handle(token: string, msg: ClientMessage) {
    const me = this.seatByToken(token);
    const isHost = !!me && me.seatId === this.room.hostSeatId;
    const hostOnly = () => {
      if (!isHost) throw new Error("Only the host can do that");
    };

    switch (msg.type) {
      case "sit": {
        if (me) throw new Error("You already have a seat");
        const name = msg.name.trim().slice(0, 16);
        if (!name) throw new Error("Pick a name");
        const idx = this.freeSeat(msg.seatIndex);
        const seat: SeatRecord = {
          seatId: newId(),
          name,
          isBot: false,
          connected: true,
          away: false,
          leaving: false,
          coached: false,
          stack: START_STACK,
          timeouts: 0,
        };
        this.room.seats[idx] = seat;
        this.room.tokens[token] = seat.seatId;
        if (!this.room.hostSeatId) this.room.hostSeatId = seat.seatId;
        break;
      }
      case "leave": {
        if (!me) return;
        if (this.inHand(me.seatId)) {
          me.leaving = true;
          this.foldIfToAct(me.seatId);
        } else this.removeSeat(me.seatId);
        break;
      }
      case "back": {
        if (!me) return;
        me.away = false;
        me.timeouts = 0;
        break;
      }
      case "start":
        hostOnly();
        this.room.started = true;
        break;
      case "addBot": {
        hostOnly();
        const idx = this.freeSeat(msg.seatIndex);
        const used = new Set(this.room.seats.filter(Boolean).map((s) => s!.name));
        const taken = new Set(this.room.seats.filter((s) => s?.isBot).map((s) => s!.personality));
        const personality =
          shuffle<Personality>(["rock", "tag", "lag", "station", "maniac"]).find((p) => !taken.has(p)) ?? "tag";
        this.room.seats[idx] = {
          seatId: newId(),
          name: BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${idx + 1}`,
          isBot: true,
          personality,
          connected: true,
          away: false,
          leaving: false,
          coached: false,
          stack: START_STACK,
          timeouts: 0,
        };
        break;
      }
      case "removeBot":
      case "kick": {
        hostOnly();
        const target = this.seatById(msg.seatId);
        if (!target || target.seatId === this.room.hostSeatId) return;
        if (msg.type === "removeBot" && !target.isBot) return;
        if (this.inHand(target.seatId)) {
          target.leaving = true;
          this.foldIfToAct(target.seatId);
        } else this.removeSeat(target.seatId);
        break;
      }
      case "coach":
        // Coaching runs in the host's browser; the server only records it so everyone sees the badge
        hostOnly();
        me!.coached = msg.on;
        break;
      case "act": {
        if (!me) throw new Error("Take a seat first");
        const g = this.room.game;
        if (!g || g.handOver) throw new Error("No hand in progress");
        if (g.players[g.toAct]?.id !== me.seatId) throw new Error("It's not your turn");
        me.timeouts = 0;
        this.apply(msg.action);
        break;
      }
    }
  }

  private apply(action: PlayerAction) {
    const g = this.room.game!;
    this.room.game = applyAction(g, action);
    if (this.room.game.handOver) this.endHand();
  }

  private foldIfToAct(seatId: string) {
    const g = this.room.game;
    if (g && !g.handOver && g.players[g.toAct]?.id === seatId) {
      this.apply({ type: legalActions(g).canCheck ? "check" : "fold" });
    }
  }

  private endHand() {
    const g = this.room.game!;
    for (const p of g.players) {
      const seat = this.seatById(p.id);
      if (seat) seat.stack = p.stack;
    }
    for (const s of this.room.seats) if (s?.leaving) this.removeSeat(s.seatId);
    this.room.turnDeadline = null;
    this.room.nextHandAt = Date.now() + NEXT_HAND_DELAY_MS;
  }

  private dealHand() {
    const eligible = this.room.seats
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s && !s.away && !s.leaving && (s.isBot || s.connected)) as { s: SeatRecord; i: number }[];
    if (eligible.length < 2) {
      this.room.game = this.room.game?.handOver ? this.room.game : null;
      this.room.nextHandAt = null;
      return;
    }
    // Cash game: busted players auto-rebuy
    for (const { s } of eligible) if (s.stack <= 0) s.stack = START_STACK;

    // Move the button clockwise to the next eligible seat after the previous button
    const prevIdx = this.room.seats.findIndex((s) => s?.seatId === this.room.buttonSeatId);
    const next =
      eligible.find(({ i }) => i > prevIdx) ?? eligible[0];
    const button = eligible.indexOf(next);
    this.room.buttonSeatId = next.s.seatId;
    this.room.handNumber++;
    this.room.game = newHand(
      eligible.map(({ s }) => ({ id: s.seatId, name: s.name, stack: s.stack, isHuman: !s.isBot })),
      button,
      { handNumber: this.room.handNumber }
    );
    this.room.nextHandAt = null;
    this.room.turnKey = null;
    if (this.room.game.handOver) this.endHand();
  }

  // ---------- timing ----------

  /** Work out what should happen next and when, and schedule a single alarm for it. */
  private scheduleNext(now = Date.now()): number | null {
    const r = this.room;
    const g = r.game;
    if (g && !g.handOver) {
      const actor = g.players[g.toAct];
      const seat = this.seatById(actor.id)!;
      const key = `${g.handNumber}:${g.history.length}`;
      if (seat.isBot) {
        r.turnDeadline = null;
        if (r.turnKey !== key) r.turnKey = key;
        return now + BOT_DELAY_MS;
      }
      if (r.turnKey !== key) {
        r.turnKey = key;
        const quick = seat.away || seat.leaving || !seat.connected;
        r.turnDeadline = now + (quick && !seat.connected ? TURN_SECONDS * 500 : quick ? AWAY_ACT_DELAY_MS : TURN_SECONDS * 1000);
      }
      return r.turnDeadline;
    }
    r.turnDeadline = null;
    if (!r.started) return null;
    if (r.nextHandAt === null) {
      const ready = r.seats.filter((s) => s && !s.away && (s.isBot || s.connected)).length >= 2;
      if (ready) r.nextHandAt = now + (g ? NEXT_HAND_DELAY_MS : 1000);
    }
    return r.nextHandAt;
  }

  async onAlarm() {
    const r = this.room;
    const now = Date.now();
    const g = r.game;
    if (g && !g.handOver) {
      const actor = g.players[g.toAct];
      const seat = this.seatById(actor.id)!;
      if (seat.isBot) {
        this.apply(botDecision(g, PROFILES[seat.personality!]));
      } else if (r.turnDeadline !== null && now >= r.turnDeadline - 50) {
        // Timed out: check if possible, otherwise fold. Two timeouts in a row sits them out.
        if (!seat.away && !seat.leaving) {
          seat.timeouts++;
          if (seat.timeouts >= 2) seat.away = true;
        }
        this.apply({ type: legalActions(g).canCheck ? "check" : "fold" });
      }
    } else if (r.started && r.nextHandAt !== null && now >= r.nextHandAt - 50) {
      this.dealHand();
    }
    await this.commit();
  }

  // ---------- persistence + broadcast ----------

  private async commit() {
    const at = this.scheduleNext();
    await this.ctx.storage.put("room", this.room);
    if (at !== null) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 10));
    else await this.ctx.storage.deleteAlarm();
    this.broadcastState();
  }

  private broadcastState() {
    for (const conn of this.getConnections<ConnState>()) {
      const token = conn.state?.token;
      this.send(conn, { type: "state", view: this.viewFor(token ? this.room.tokens[token] ?? null : null) });
    }
  }

  private viewFor(seatId: string | null): RoomView {
    const r = this.room;
    return {
      code: this.name,
      // Strip private bookkeeping (stack is shown via the game state)
      seats: r.seats.map((s) =>
        s
          ? {
              seatId: s.seatId,
              name: s.name,
              isBot: s.isBot,
              personality: s.personality,
              connected: s.connected,
              away: s.away,
              leaving: s.leaving,
              coached: s.coached,
            }
          : null
      ),
      hostSeatId: r.hostSeatId,
      started: r.started,
      mySeatId: seatId,
      game: r.game ? redactGame(r.game, seatId) : null,
      turnDeadline: r.turnDeadline,
      nextHandAt: r.nextHandAt,
      serverNow: Date.now(),
    };
  }

  private send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  // ---------- helpers ----------

  private seatByToken(token: string) {
    const id = this.room.tokens[token];
    return id ? this.seatById(id) : null;
  }
  private seatById(id: string) {
    return this.room.seats.find((s) => s?.seatId === id) ?? null;
  }
  private inHand(seatId: string) {
    const g = this.room.game;
    return !!g && !g.handOver && g.players.some((p) => p.id === seatId && !p.folded);
  }
  private freeSeat(preferred?: number) {
    if (preferred !== undefined && preferred >= 0 && preferred < MAX_SEATS && !this.room.seats[preferred]) return preferred;
    const idx = this.room.seats.findIndex((s) => !s);
    if (idx < 0) throw new Error("The table is full");
    return idx;
  }
  private removeSeat(seatId: string) {
    const idx = this.room.seats.findIndex((s) => s?.seatId === seatId);
    if (idx < 0) return;
    this.room.seats[idx] = null;
    for (const [t, id] of Object.entries(this.room.tokens)) if (id === seatId) delete this.room.tokens[t];
    if (this.room.hostSeatId === seatId) {
      // Hand host to the next human at the table
      this.room.hostSeatId = this.room.seats.find((s) => s && !s.isBot)?.seatId ?? null;
    }
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env as never, { cors: true })) ??
      new Response("Jev Poker room server", { status: 200 })
    );
  },
};

export default worker;
