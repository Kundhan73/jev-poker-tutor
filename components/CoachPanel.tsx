"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { Grade } from "@/lib/coach/analysis";
import { useGame } from "@/store/game";

const GRADE_STYLE: Record<Grade, string> = {
  Best: "text-good border-good/50 bg-good/10",
  Good: "text-good/80 border-good/30 bg-good/5",
  Questionable: "text-warn border-warn/40 bg-warn/10",
  Mistake: "text-bad border-bad/50 bg-bad/10",
};

export function CoachPanel() {
  const game = useGame((s) => s.game);
  const advice = useGame((s) => s.advice);
  const pending = useGame((s) => s.advicePending);
  const mode = useGame((s) => s.mode);
  const jev = useGame((s) => s.jev);
  const decisions = useGame((s) => s.decisions);
  const lastError = useGame((s) => s.lastError);
  const heroId = useGame((s) => s.heroId);

  const heroTurn = !!game && !game.handOver && game.players[game.toAct]?.id === heroId;
  const last = decisions.at(-1);
  const hidden = mode === "quiz";

  return (
    <section className="panel rounded-2xl p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-none">Jev&rsquo;s call</h2>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
          {jev.available ? `TypeSafe · ${jev.model}` : "Math-only mode"}
        </span>
      </header>

      {heroTurn && (pending || !advice) && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <span className="h-2 w-2 animate-ping rounded-full bg-brass" />
          {jev.available ? "Jev is reading the spot…" : "Crunching equity…"}
        </div>
      )}

      {heroTurn && advice && !pending && hidden && (
        <div className="broadcast rounded-r-lg px-3 py-4 text-sm">
          <div className="font-semibold text-brass">Quiz mode</div>
          <div className="text-muted">Make your move. Jev grades it right after.</div>
        </div>
      )}

      {heroTurn && advice && !pending && !hidden && <Distribution />}

      {!heroTurn && !last && (
        <p className="py-4 text-sm text-muted">
          Jev watches every action at the table. When it&rsquo;s your turn it recommends a move and shows how strongly it
          prefers each option.
        </p>
      )}

      <AnimatePresence mode="popLayout">
        {last && !heroTurn && (
          <motion.div
            key={decisions.length}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="mt-1 space-y-2"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Your last decision · {last.street}</div>
            <div className={`inline-flex rounded-full border px-3 py-0.5 text-sm font-bold ${GRADE_STYLE[last.grade]}`}>
              {last.grade}
            </div>
            <div className="text-sm">
              You: <span className="font-semibold">{last.chosenLabel}</span>
              {last.chosen !== last.coachChoice && (
                <>
                  {" "}
                  · Jev: <span className="font-semibold text-brass">{last.coachLabel}</span>
                </>
              )}
            </div>
            <MiniBars probs={last.probabilities} highlight={last.chosen} />
          </motion.div>
        )}
      </AnimatePresence>
      {lastError && <p className="mt-3 text-[11px] text-warn/80">{lastError}</p>}
    </section>
  );
}

function Distribution() {
  const advice = useGame((s) => s.advice)!;
  const { decision, menu } = advice;
  const rows = menu
    .map((o) => ({ o, p: decision.probabilities[o.id] ?? 0 }))
    .sort((a, b) => b.p - a.p);
  const top = menu.find((o) => o.id === decision.choice);
  return (
    <div>
      <div className="broadcast mb-3 rounded-r-lg px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-brass/80">Recommended</div>
        <div className="font-display text-3xl leading-tight">{top?.label ?? decision.choice}</div>
        <div className="num text-xs text-muted">
          confidence {Math.round(decision.confidence * 100)}%
          {decision.latencyMs ? ` · ${decision.latencyMs} ms` : ""}
          {decision.source === "math" ? " · EV model" : ""}
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map(({ o, p }, i) => (
          <li key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
            <span className={o.id === decision.choice ? "font-semibold text-cream" : "text-cream/75"}>{o.label}</span>
            <span className="num text-xs text-muted">{(p * 100).toFixed(1)}%</span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(1, p * 100)}%` }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: "easeOut" }}
                className={`h-full rounded-full ${o.id === decision.choice ? "bg-brass" : "bg-cream/30"}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniBars({ probs, highlight }: { probs: Record<string, number | undefined>; highlight: string }) {
  const entries = Object.entries(probs).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
      {entries.map(([id, p]) => (
        <div
          key={id}
          title={`${id}: ${((p ?? 0) * 100).toFixed(0)}%`}
          style={{ width: `${(p ?? 0) * 100}%` }}
          className={`h-full border-r border-ink ${id === highlight ? "bg-brass" : "bg-cream/25"}`}
        />
      ))}
    </div>
  );
}
