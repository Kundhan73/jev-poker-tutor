"use client";
import Link from "next/link";
import { useGame } from "@/store/game";
import { JevUnlock } from "./JevUnlock";

export function Header() {
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);
  const revealBots = useGame((s) => s.revealBots);
  const toggleReveal = useGame((s) => s.toggleReveal);
  const newSession = useGame((s) => s.newSession);
  const jev = useGame((s) => s.jev);
  const history = useGame((s) => s.history);

  const all = history.flatMap((h) => h.decisions);
  const counted = all.length;
  const good = all.filter((d) => d.grade === "Best" || d.grade === "Good").length;
  const net = history.reduce((t, h) => t + h.net, 0);

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-4 pt-5 sm:px-8">
      <div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-[0.35em] text-brass/80 hover:text-brass">
          ← Lobby · No-Limit Hold&rsquo;em · 6-max
        </Link>
        <h1 className="font-display text-4xl leading-none sm:text-5xl">
          Jev <span className="italic text-brass">Poker Tutor</span>
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="num mr-2 flex gap-4 text-muted">
          <span>
            Net <b className={net >= 0 ? "text-good" : "text-bad"}>{net >= 0 ? "+" : ""}{net}</b>
          </span>
          <span>
            <span title="How often you picked the move Jev rated best. Agreeing with Jev doesn't guarantee winning the hand.">Followed Jev</span> <b className="text-cream">{counted ? Math.round((100 * good) / counted) : "–"}%</b>
            <span className="text-muted/70"> ({counted})</span>
          </span>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 font-semibold ${
            jev.available ? "border-good/40 text-good" : "border-warn/40 text-warn"
          }`}
          title={jev.available ? "Decisions come from TypeSafe's Jev" : jev.locked ? "Jev is locked to the site owner" : "Set TYPESAFE_API_KEY to enable Jev"}
        >
          {jev.checked ? (jev.available ? "● Jev online" : "● Math-only") : "…"}
        </span>
        <JevUnlock />
        <div className="flex overflow-hidden rounded-full border border-cream/20">
          {(["coach", "quiz"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 font-semibold capitalize transition ${mode === m ? "bg-brass text-ink" : "hover:text-brass"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <button onClick={toggleReveal} className="rounded-full border border-cream/20 px-3 py-1 hover:border-brass hover:text-brass">
          {revealBots ? "Hide" : "Reveal"} bot styles
        </button>
        <button onClick={newSession} className="rounded-full border border-cream/20 px-3 py-1 hover:border-brass hover:text-brass">
          New table
        </button>
      </div>
    </header>
  );
}
