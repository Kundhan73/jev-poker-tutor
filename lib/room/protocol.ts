import type { GameState, PlayerAction } from "../game/engine";
import type { Personality } from "../game/bots";

export const MAX_SEATS = 6;
export const START_STACK = 200;
export const TURN_SECONDS = 30;
/** Party name as routed by partyserver: the kebab-cased Durable Object binding `PokerRoom`. */
export const PARTY = "poker-room";
/** Placeholder for a card the viewer isn't allowed to see. */
export const HIDDEN_CARD = -1;

export interface RoomSeat {
  /** Public seat id, also used as the engine player id. Never a secret. */
  seatId: string;
  name: string;
  isBot: boolean;
  personality?: Personality;
  connected: boolean;
  /** Sitting out: not dealt in until they come back. */
  away: boolean;
  /** Will leave the table when the current hand ends. */
  leaving: boolean;
  /** Shows everyone that this player is getting Jev coaching. */
  coached: boolean;
}

export interface RoomView {
  code: string;
  /** Fixed-size array of seat slots; null = empty. */
  seats: (RoomSeat | null)[];
  hostSeatId: string | null;
  started: boolean;
  /** The viewer's seat id, or null for spectators. */
  mySeatId: string | null;
  game: GameState | null;
  /** Epoch ms when the current player's turn times out. */
  turnDeadline: number | null;
  /** Epoch ms when the next hand will be dealt. */
  nextHandAt: number | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "sit"; name: string; seatIndex?: number }
  | { type: "leave" }
  | { type: "back" }
  | { type: "start" }
  | { type: "act"; action: PlayerAction }
  | { type: "addBot"; seatIndex?: number }
  | { type: "removeBot"; seatId: string }
  | { type: "kick"; seatId: string }
  | { type: "coach"; on: boolean };

export type ServerMessage = { type: "state"; view: RoomView } | { type: "error"; message: string };

/**
 * The game state as one viewer is allowed to see it: no deck, and other players' hole cards
 * replaced by placeholders unless they were shown down.
 */
export function redactGame(game: GameState, viewerId: string | null): GameState {
  const showdown = game.street === "showdown";
  return {
    ...game,
    deck: [],
    players: game.players.map((p) => ({
      ...p,
      hole: p.id === viewerId || (showdown && !p.folded) ? [...p.hole] : p.hole.map(() => HIDDEN_CARD),
    })),
  };
}

/** Short, unambiguous room codes (no 0/O/1/I). */
export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
}
