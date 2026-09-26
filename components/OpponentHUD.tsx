"use client";
import { PROFILES } from "@/lib/game/bots";
import { useGame } from "@/store/game";
import { RangeGrid } from "./RangeGrid";

function Gauge({ label, value, tone = "brass" }: { label: string; value: number; tone?: "brass" | "bad" }) {
  return (
    <div className="grid grid-cols-[82px_1fr_34px] items-center gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone === "bad" ? "bg-bad/80" : "bg-brass"}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="num text-right text-cream/80">{Math.round(value * 100)}</span>
    </div>
  );
}

export function OpponentHUD() {
  const game = useGame((s) => s.game);
  const seats = useGame((s) => s.seats);
  const reads = useGame((s) => s.reads);
  const pending = useGame((s) => s.readPending);
  const stats = useGame((s) => s.stats);
  const revealBots = useGame((s) => s.revealBots);
  const selected = useGame((s) => s.selectedOpponent);
  const select = useGame((s) => s.selectOpponent);
  const advice = useGame((s) => s.advice);
  const mode = useGame((s) => s.mode);
  const heroId = useGame((s) => s.heroId);
  if (!game) return null;

  const bots = game.players.filter((p) => p.id !== heroId);
  const selId = selected ?? bots.find((b) => !b.folded)?.id ?? null;
  const grid = selId && mode === "coach" ? advice?.grids[selId] : undefined;
  const selName = bots.find((b) => b.id === selId)?.name;

  return (
    <section className="panel rounded-2xl p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Live opponent reads</h3>
      <div className="space-y-2">
        {bots.map((p) => {
          const r = reads[p.id];
          const st = stats[p.id];
          const seat = seats.find((s) => s.id === p.id);
          const vpip = st?.hands ? Math.round((100 * st.vpipHands) / st.hands) : null;
          const pfr = st?.hands ? Math.round((100 * st.pfrHands) / st.hands) : null;
          return (
            <button
              key={p.id}
              onClick={() => select(selected === p.id ? null : p.id)}
              className={`w-full rounded-xl border p-2.5 text-left transition ${
                selId === p.id ? "border-brass/50 bg-brass/5" : "border-white/5 hover:border-white/15"
              } ${p.folded ? "opacity-45" : ""}`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {p.name}
                  {revealBots && seat?.personality && (
                    <span className="ml-2 text-[10px] font-bold text-warn">{PROFILES[seat.personality].label}</span>
                  )}
                </span>
                <span className="num flex items-center gap-2 text-[10px] text-muted">
                  {pending[p.id] && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-brass" />}
                  {r?.source === "jev" ? "JEV" : "EST"} · VPIP {vpip ?? "–"} / PFR {pfr ?? "–"} · {st?.hands ?? 0}h
                </span>
              </div>
              {r && (
                <div className="space-y-1">
                  <Gauge label="Aggression" value={r.aggression} />
                  <Gauge label="Looseness" value={r.looseness} />
                  {!p.folded && <Gauge label="Hand strength" value={r.rangeStrength} />}
                  {!p.folded && <Gauge label="Bluff chance" value={r.bluffing} tone="bad" />}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {grid && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] text-muted">
            Estimated range: <span className="text-cream">{selName}</span>
          </div>
          <RangeGrid grid={grid} />
        </div>
      )}
    </section>
  );
}
