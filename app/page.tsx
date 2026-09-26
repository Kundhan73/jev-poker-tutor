"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { makeRoomCode } from "@/lib/room/protocol";

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-brass/80">No-Limit Hold&rsquo;em · 6-max</div>
      <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl">
        Jev <span className="italic text-brass">Poker Tutor</span>
      </h1>
      <p className="mt-4 max-w-xl text-cream/75">
        Play against bots or friends while TypeSafe AI&rsquo;s Jev reads the table and tells you the best move.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <Link href="/solo" className="panel group rounded-2xl p-6 transition hover:border-brass/60">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Practice</div>
          <div className="mt-2 font-display text-3xl">Play vs bots</div>
          <p className="mt-2 text-sm text-cream/70">Five bots with hidden styles. Jev coaches you on every decision.</p>
          <div className="mt-6 text-sm font-semibold text-brass group-hover:translate-x-1 transition">Sit down →</div>
        </Link>

        <button
          onClick={() => router.push(`/room/${makeRoomCode()}`)}
          className="panel group rounded-2xl p-6 text-left transition hover:border-brass/60"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Host</div>
          <div className="mt-2 font-display text-3xl">Create a room</div>
          <p className="mt-2 text-sm text-cream/70">Get a link for up to five friends. Only you get Jev&rsquo;s analysis.</p>
          <div className="mt-6 text-sm font-semibold text-brass group-hover:translate-x-1 transition">New room →</div>
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (cleaned.length === 5) router.push(`/room/${cleaned}`);
          }}
          className="panel rounded-2xl p-6"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Join</div>
          <div className="mt-2 font-display text-3xl">Got a code?</div>
          <input
            value={cleaned}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7QXM"
            aria-label="Room code"
            className="num mt-4 w-full rounded-xl border border-cream/20 bg-black/30 px-4 py-3 text-2xl tracking-[0.4em] uppercase outline-none placeholder:text-cream/20 focus:border-brass"
          />
          <button
            disabled={cleaned.length !== 5}
            className="mt-3 w-full rounded-full bg-brass py-2.5 font-bold text-ink transition enabled:hover:brightness-110 disabled:opacity-30"
          >
            Join room
          </button>
        </form>
      </div>
      <p className="mt-10 text-[11px] text-muted/70">Play-money only. Everyone at a room table can see who has Jev turned on.</p>
    </main>
  );
}
