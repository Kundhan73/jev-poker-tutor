"use client";
import { AnimatePresence, motion } from "framer-motion";
import { GameState, Player, positionName, pot } from "@/lib/game/engine";
import { PROFILES } from "@/lib/game/bots";
import { categoryName, evaluate } from "@/lib/poker/evaluator";
import { HIDDEN_CARD, MAX_SEATS, RoomSeat } from "@/lib/room/protocol";
import { useGame } from "@/store/game";
import { PlayingCard } from "./PlayingCard";

/** Seat anchor points around the oval (percent of table box). Slot 0 (you) sits bottom-centre. */
const SEAT_POS = [
  { x: 50, y: 100 },
  { x: 6, y: 74 },
  { x: 6, y: 22 },
  { x: 50, y: 0 },
  { x: 94, y: 22 },
  { x: 94, y: 74 },
];
/** Where each slot's bet chips sit (towards the middle). */
const BET_POS = [
  { x: 50, y: 79 },
  { x: 24, y: 64 },
  { x: 24, y: 34 },
  { x: 50, y: 24 },
  { x: 76, y: 34 },
  { x: 76, y: 64 },
];

export interface TableActions {
  onSit?: (seatIndex: number) => void;
  onAddBot?: (seatIndex: number) => void;
}

export function PokerTable({ onSit, onAddBot }: TableActions = {}) {
  const game = useGame((s) => s.game);
  const seats = useGame((s) => s.seats);
  const room = useGame((s) => s.room);
  const heroId = useGame((s) => s.heroId);
  const revealBots = useGame((s) => s.revealBots);
  const selectOpponent = useGame((s) => s.selectOpponent);
  const selected = useGame((s) => s.selectedOpponent);

  // Map each seat slot (0..5) to a display position, rotating so "you" are at the bottom
  const roomSeats = room?.seats ?? null;
  const mySlot = roomSeats ? Math.max(0, roomSeats.findIndex((s) => s?.seatId === room?.mySeatId)) : 0;
  const slotOfPlayer = (p: Player, i: number) => (roomSeats ? roomSeats.findIndex((s) => s?.seatId === p.id) : i);
  const displayPos = (slot: number) => (roomSeats ? (slot - mySlot + MAX_SEATS) % MAX_SEATS : slot);

  if (!game && !roomSeats) return <div className="aspect-[16/10] w-full" />;

  const showdown = game?.street === "showdown";
  const winners = new Set(game?.results?.flatMap((r) => r.winners) ?? []);
  const inHand = new Set(game?.players.map((p) => p.id) ?? []);
  const isHost = !!room?.mySeatId && room.mySeatId === room.hostSeatId;
  const seated = !!room?.mySeatId;

  return (
    <div className="relative mx-auto w-full max-w-[860px] px-3 pb-16 pt-12 sm:px-10">
      <div className="felt relative mx-auto aspect-[2.1/1] w-full rounded-[999px]">
        {/* Centre: board + pot */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="flex min-h-[62px] gap-1 sm:gap-1.5">
            {game?.board.map((c, i) => (
              <PlayingCard key={`${game.handNumber}-b${i}`} card={c} size="md" delay={i < 3 ? i * 0.08 : 0} />
            ))}
            {Array.from({ length: 5 - (game?.board.length ?? 0) }).map((_, i) => (
              <div key={`e${i}`} className="h-[62px] w-11 rounded-md border border-dashed border-brass/15" />
            ))}
          </div>
          {game ? (
            <>
              <div className="num rounded-full bg-black/35 px-3 py-0.5 text-sm text-cream">
                Pot <span className="text-brass">{pot(game)}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-brass/60">
                Hand #{game.handNumber} · {game.street}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted">
              {room?.started ? "Waiting for at least 2 players…" : "Waiting for the host to start"}
            </div>
          )}
        </div>

        {/* Bets in front of each seat */}
        {game?.players.map((p, i) => {
          if (p.committed <= 0 || game.handOver) return null;
          const pos = BET_POS[displayPos(slotOfPlayer(p, i))];
          return (
            <motion.div
              key={`bet-${p.id}-${game.street}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="num absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 text-xs"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-white/70 bg-[var(--chip-red)]" />
              {p.committed}
            </motion.div>
          );
        })}

        {/* Players in the current hand */}
        {game?.players.map((p, i) => {
          const pos = SEAT_POS[displayPos(slotOfPlayer(p, i))];
          const seatInfo = seats.find((s) => s.id === p.id);
          const roomSeat = roomSeats?.find((s) => s?.seatId === p.id) ?? null;
          const isMe = p.id === heroId;
          const acting = game.toAct === i && !game.handOver;
          const won = winners.has(p.id);
          const visible = p.hole.every((c) => c !== HIDDEN_CARD) && (isMe || (showdown && !p.folded));
          const handLabel = showdown && !p.folded && visible ? categoryName(evaluate([...p.hole, ...game.board])) : null;
          return (
            <div
              key={p.id}
              className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center ${isMe ? "flex-row-reverse gap-2" : "flex-col"}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className={`flex gap-0.5 ${isMe ? "" : "mb-1"} ${p.folded ? "opacity-30" : ""}`}>
                {p.hole.map((c, k) => (
                  <PlayingCard
                    key={`${game.handNumber}-${p.id}-${k}`}
                    card={c === HIDDEN_CARD ? undefined : c}
                    hidden={!visible}
                    size={isMe ? "lg" : "sm"}
                    delay={0.05 * (i + k * 6)}
                    highlight={won && showdown}
                  />
                ))}
              </div>
              <button
                onClick={() => !isMe && selectOpponent(selected === p.id ? null : p.id)}
                className={`panel min-w-[92px] rounded-xl px-2.5 py-1 text-center transition ${acting ? "acting border-brass" : ""} ${
                  selected === p.id ? "ring-1 ring-brass" : ""
                } ${won && game.handOver ? "border-good bg-good/15" : ""} ${isMe ? "cursor-default" : "hover:border-brass/60"}`}
              >
                <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold leading-tight">
                  {isMe && room ? "You" : p.name}
                  <span className="rounded bg-brass/15 px-1 text-[9px] font-bold tracking-wider text-brass">
                    {positionName(game, i)}
                  </span>
                </div>
                <div className="num text-xs text-muted">{p.stack}</div>
                <SeatBadges seat={roomSeat} hostSeatId={room?.hostSeatId ?? null} />
                {seatInfo?.personality && revealBots && (
                  <div className="text-[10px] font-semibold text-warn">{PROFILES[seatInfo.personality].label}</div>
                )}
                {handLabel && <div className="text-[10px] text-cream/80">{handLabel}</div>}
              </button>
              <AnimatePresence>
                {lastActionOf(game, p.id) && !game.handOver && (
                  <motion.div
                    key={game.history.length}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-1 rounded bg-black/50 px-1.5 text-[10px] uppercase tracking-wider text-brass"
                  >
                    {lastActionOf(game, p.id)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Room seats not in the current hand: empty slots, or players waiting for the next deal */}
        {roomSeats?.map((s, slot) => {
          if (s && inHand.has(s.seatId)) return null;
          const pos = SEAT_POS[displayPos(slot)];
          return (
            <div
              key={`slot-${slot}`}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {s ? (
                <div className="panel min-w-[92px] rounded-xl px-2.5 py-1 text-center opacity-75">
                  <div className="text-[13px] font-semibold">{s.seatId === room?.mySeatId ? "You" : s.name}</div>
                  <SeatBadges seat={s} hostSeatId={room?.hostSeatId ?? null} />
                  <div className="text-[10px] text-muted">{s.away ? "sitting out" : "joins next hand"}</div>
                </div>
              ) : (
                <>
                  {!seated && onSit && (
                    <button
                      onClick={() => onSit(slot)}
                      className="whitespace-nowrap rounded-full border border-dashed border-brass/60 bg-black/30 px-3 py-1.5 text-xs font-semibold text-brass hover:bg-brass/10"
                    >
                      Sit here
                    </button>
                  )}
                  {isHost && onAddBot && (
                    <button
                      onClick={() => onAddBot(slot)}
                      className="whitespace-nowrap rounded-full border border-dashed border-cream/25 bg-black/30 px-3 py-1 text-[11px] text-muted hover:border-cream/50 hover:text-cream"
                    >
                      + Add bot
                    </button>
                  )}
                  {seated && !isHost && (
                    <div className="rounded-full border border-dashed border-white/10 px-3 py-1 text-[11px] text-muted/60">Empty</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeatBadges({ seat, hostSeatId }: { seat: RoomSeat | null; hostSeatId: string | null }) {
  if (!seat) return null;
  const badges: [string, string][] = [];
  if (seat.seatId === hostSeatId) badges.push(["Host", "text-brass"]);
  if (seat.coached) badges.push(["🤖 Jev", "text-good"]);
  if (seat.isBot) badges.push(["Bot", "text-muted"]);
  if (!seat.isBot && !seat.connected) badges.push(["offline", "text-bad"]);
  else if (seat.away) badges.push(["away", "text-warn"]);
  if (!badges.length) return null;
  return (
    <div className="flex justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
      {badges.map(([t, c]) => (
        <span key={t} className={c}>
          {t}
        </span>
      ))}
    </div>
  );
}

function lastActionOf(game: GameState, id: string) {
  const h = game.history.filter((x) => x.playerId === id && x.street === game.street).at(-1);
  if (!h) return game.players.find((p) => p.id === id)?.folded ? "fold" : null;
  if (h.type === "sb" || h.type === "bb") return null;
  if (h.type === "fold" || h.type === "check") return h.type;
  return `${h.type === "allin" ? "all-in" : h.type} ${h.to}`;
}
