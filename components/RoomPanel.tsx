"use client";
import { useState } from "react";
import type { ClientMessage } from "@/lib/room/protocol";
import { useGame } from "@/store/game";
import { JevUnlock } from "./JevUnlock";

export function RoomPanel({ send, connected }: { send: (m: ClientMessage) => void; connected: boolean }) {
  const room = useGame((s) => s.room);
  const jev = useGame((s) => s.jev);
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const me = room.seats.find((s) => s?.seatId === room.mySeatId) ?? null;
  const isHost = !!me && me.seatId === room.hostSeatId;
  const people = room.seats.filter(Boolean).length;
  const link = typeof window !== "undefined" ? window.location.href : "";

  return (
    <section className="panel rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Room</div>
          <div className="num text-3xl tracking-[0.3em] text-brass">{room.code}</div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${connected ? "text-good" : "text-warn"}`}>
          {connected ? "● live" : "● reconnecting"}
        </span>
      </div>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className="mt-3 w-full truncate rounded-lg border border-cream/15 bg-black/25 px-3 py-2 text-left text-xs text-cream/80 hover:border-brass/50"
        title="Copy invite link"
      >
        {copied ? "Link copied. Send it to your friends!" : `🔗 ${link}`}
      </button>

      <ul className="mt-4 space-y-1 text-sm">
        {room.seats.map((s, i) =>
          s ? (
            <li key={s.seatId} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="num mr-2 text-[10px] text-muted">{i + 1}</span>
                {s.name}
                {s.seatId === room.mySeatId && <span className="text-muted"> (you)</span>}
                {s.seatId === room.hostSeatId && <span className="ml-1.5 text-[10px] font-bold text-brass">HOST</span>}
                {s.coached && <span className="ml-1.5 text-[10px] font-bold text-good">🤖 JEV</span>}
                {s.isBot && <span className="ml-1.5 text-[10px] text-muted">bot</span>}
                {!s.isBot && !s.connected && <span className="ml-1.5 text-[10px] text-bad">offline</span>}
                {s.away && <span className="ml-1.5 text-[10px] text-warn">away</span>}
              </span>
              {isHost && s.seatId !== room.mySeatId && (
                <button
                  onClick={() => send(s.isBot ? { type: "removeBot", seatId: s.seatId } : { type: "kick", seatId: s.seatId })}
                  className="text-[11px] text-muted hover:text-bad"
                >
                  {s.isBot ? "remove" : "kick"}
                </button>
              )}
            </li>
          ) : null
        )}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {isHost && !room.started && (
          <button
            disabled={people < 2}
            onClick={() => send({ type: "start" })}
            className="rounded-full bg-brass px-4 py-2 font-bold text-ink disabled:opacity-40"
            title={people < 2 ? "Need at least 2 players (add a bot or invite a friend)" : ""}
          >
            Start game
          </button>
        )}
        {isHost && (
          <button
            onClick={() => send({ type: "coach", on: !me?.coached })}
            disabled={!jev.checked}
            className={`rounded-full border px-3 py-2 font-semibold ${me?.coached ? "border-good/50 text-good" : "border-cream/25 hover:border-brass hover:text-brass"}`}
            title="Everyone at the table can see when Jev coaching is on"
          >
            {me?.coached ? "🤖 Jev coaching: on" : "Turn on Jev coaching"}
          </button>
        )}
        {me?.away && (
          <button onClick={() => send({ type: "back" })} className="rounded-full border border-warn/50 px-3 py-2 text-warn">
            I&rsquo;m back
          </button>
        )}
        {me && (
          <button onClick={() => send({ type: "leave" })} className="rounded-full border border-cream/20 px-3 py-2 hover:border-bad hover:text-bad">
            {me.leaving ? "Leaving after this hand…" : "Leave seat"}
          </button>
        )}
      </div>
      {isHost && jev.locked && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>Coaching uses the math engine until you unlock Jev:</span>
          <JevUnlock />
        </div>
      )}
      {isHost && !jev.available && !jev.locked && jev.checked && (
        <p className="mt-2 text-[11px] text-warn/80">No Jev API key on this server, so coaching uses the math engine.</p>
      )}
      {!isHost && me && (
        <p className="mt-3 text-[11px] text-muted">
          Only the host can use Jev coaching, and you&rsquo;ll see a 🤖 badge whenever it&rsquo;s on.
        </p>
      )}
    </section>
  );
}
