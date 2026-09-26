"use client";
import { motion } from "framer-motion";
import { useGame } from "@/store/game";

const GRADE_COLOR = { Best: "text-good", Good: "text-good/80", Questionable: "text-warn", Mistake: "text-bad" } as const;

export function HandReview() {
  const game = useGame((s) => s.game);
  const history = useGame((s) => s.history);
  if (!game?.handOver) return null;
  const rec = history.at(-1);
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel rounded-2xl p-4"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-xl">Hand #{game.handNumber} review</h3>
        {rec && (
          <span className={`num text-sm ${rec.net > 0 ? "text-good" : rec.net < 0 ? "text-bad" : "text-muted"}`}>
            {rec.net > 0 ? "+" : ""}
            {rec.net} chips
          </span>
        )}
      </div>
      <ul className="mb-3 space-y-0.5 text-sm">
        {game.results?.map((r, i) => (
          <li key={i}>
            <span className="text-brass">{r.winners.map(name).join(" & ")}</span> win{r.winners.length === 1 ? "s" : ""}{" "}
            <span className="num">{r.amount}</span>
            {game.results!.length > 1 && <span className="text-muted"> ({i === 0 ? "main pot" : `side pot ${i}`})</span>}
          </li>
        ))}
      </ul>
      {rec && rec.decisions.length > 0 ? (
        <ol className="space-y-1.5">
          {rec.decisions.map((d, i) => (
            <li key={i} className="grid grid-cols-[64px_1fr_auto] gap-2 rounded-lg bg-black/25 px-3 py-2 text-xs">
              <span className="uppercase tracking-wider text-muted">{d.street}</span>
              <span>
                {d.facing}: you <b>{d.chosenLabel}</b>
                {d.chosen !== d.coachChoice && (
                  <>
                    , Jev preferred <b className="text-brass">{d.coachLabel}</b>
                  </>
                )}
                <span className="num text-muted"> · eq {(d.equity * 100).toFixed(0)}%</span>
              </span>
              <span className={`font-bold ${GRADE_COLOR[d.grade]}`}>{d.grade}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted">You had no decisions this hand.</p>
      )}
    </motion.section>
  );
}
