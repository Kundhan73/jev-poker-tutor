"use client";
import { useGame } from "@/store/game";

export function MathBreakdown() {
  const advice = useGame((s) => s.advice);
  const mode = useGame((s) => s.mode);
  const pending = useGame((s) => s.advicePending);
  if (!advice || pending || mode === "quiz") return null;
  const { facts, equity, evs, menu } = advice;
  const needed = facts.potOdds;
  const stats: [string, string, string?][] = [
    ["Your equity", `${(equity * 100).toFixed(1)}%`, "Chance of winning at showdown vs. estimated ranges"],
    ["Pot odds", needed === null ? "—" : `${(needed * 100).toFixed(1)}%`, "Equity needed to call profitably"],
    ["Pot", `${facts.pot}`],
    ["SPR", facts.spr.toFixed(1), "Stack-to-pot ratio"],
  ];
  return (
    <section className="panel rounded-2xl p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">The math feeding Jev</h3>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([k, v, tip]) => (
          <div key={k} title={tip} className="rounded-lg bg-black/25 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">{k}</div>
            <div className="num text-lg">{v}</div>
          </div>
        ))}
      </div>
      {needed !== null && (
        <div className="mt-2 text-xs text-muted">
          {equity >= needed ? (
            <span className="text-good">Equity beats pot odds: calling is +EV on its own.</span>
          ) : (
            <span className="text-warn">Equity is below pot odds: calling needs implied odds or a read.</span>
          )}
        </div>
      )}
      {facts.texture && <div className="mt-2 text-xs text-cream/80">Board: {facts.texture.description}</div>}
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="font-normal">Action</th>
            <th className="text-right font-normal">Est. EV</th>
            <th className="text-right font-normal">Fold eq.</th>
          </tr>
        </thead>
        <tbody className="num">
          {evs.map((e) => (
            <tr key={e.id} className="border-t border-white/5">
              <td className="py-1 font-sans">{menu.find((m) => m.id === e.id)?.label}</td>
              <td className={`text-right ${e.ev > 0 ? "text-good" : e.ev < 0 ? "text-bad" : ""}`}>
                {e.ev > 0 ? "+" : ""}
                {e.ev.toFixed(1)}
              </td>
              <td className="text-right text-muted">{e.foldEquity !== undefined ? `${Math.round(e.foldEquity * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] leading-snug text-muted/80">
        EV is a one-street teaching estimate in chips relative to folding. Jev weighs it alongside opponent reads.
      </p>
    </section>
  );
}
