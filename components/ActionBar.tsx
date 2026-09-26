"use client";
import { useEffect, useMemo, useState } from "react";
import { legalActions } from "@/lib/game/engine";
import { actionMenu } from "@/lib/poker/spot";
import { useGame } from "@/store/game";

export function ActionBar() {
  const game = useGame((s) => s.game);
  const advice = useGame((s) => s.advice);
  const mode = useGame((s) => s.mode);
  const humanAct = useGame((s) => s.humanAct);
  const startHand = useGame((s) => s.startHand);
  const heroId = useGame((s) => s.heroId);
  const kind = useGame((s) => s.kind);
  const room = useGame((s) => s.room);
  const [custom, setCustom] = useState<number | null>(null);

  const heroTurn = !!game && !game.handOver && game.players[game.toAct]?.id === heroId;
  const menu = useMemo(() => (heroTurn && game ? actionMenu(game) : []), [heroTurn, game]);
  const legal = heroTurn && game ? legalActions(game) : null;

  if (!game) return null;
  if (game.handOver && kind === "room")
    return (
      <div className="py-3 text-center text-sm text-muted">
        {room?.nextHandAt ? <Countdown to={room.nextHandAt} label="Next hand in" /> : "Waiting for players…"}
      </div>
    );
  if (game.handOver)
    return (
      <div className="flex justify-center">
        <button
          onClick={() => startHand()}
          className="rounded-full bg-brass px-8 py-3 font-bold text-ink shadow-lg transition hover:brightness-110"
        >
          Deal next hand →
        </button>
      </div>
    );
  if (!heroTurn)
    return (
      <div className="py-3 text-center text-sm text-muted">
        Waiting for {game.players[game.toAct]?.name}…
        {kind === "room" && room?.turnDeadline && <Countdown to={room.turnDeadline} label="" />}
      </div>
    );

  const recommended = mode === "coach" ? advice?.decision.choice : undefined;
  const sliderVal = custom ?? legal!.minRaiseTo;

  return (
    <div className="flex flex-col items-center gap-3">
      {kind === "room" && room?.turnDeadline && (
        <div className="text-xs text-warn">
          <Countdown to={room.turnDeadline} label="Your turn:" />
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {menu.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              setCustom(null);
              humanAct(o.action, o.id);
            }}
            className={`relative rounded-full border px-4 py-2 text-sm font-semibold transition ${
              o.id === "fold"
                ? "border-bad/40 text-bad hover:bg-bad/10"
                : o.id === "all_in"
                  ? "border-warn/50 text-warn hover:bg-warn/10"
                  : "border-cream/25 hover:border-brass hover:text-brass"
            } ${recommended === o.id ? "!border-brass bg-brass/15 !text-brass shadow-[0_0_20px_rgba(212,175,95,0.35)]" : ""}`}
          >
            {o.label}
            {recommended === o.id && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-brass px-1.5 text-[9px] font-bold uppercase tracking-wider text-ink">
                Jev
              </span>
            )}
          </button>
        ))}
      </div>
      {legal!.canRaise && legal!.maxRaiseTo > legal!.minRaiseTo && (
        <div className="flex w-full max-w-md items-center gap-3 text-xs text-muted">
          <span className="num">{legal!.minRaiseTo}</span>
          <input
            type="range"
            className="flex-1"
            min={legal!.minRaiseTo}
            max={legal!.maxRaiseTo}
            value={sliderVal}
            onChange={(e) => setCustom(Number(e.target.value))}
          />
          <span className="num">{legal!.maxRaiseTo}</span>
          <button
            onClick={() => {
              const to = sliderVal;
              setCustom(null);
              humanAct(to >= legal!.maxRaiseTo ? { type: "allin" } : { type: legal!.isBet ? "bet" : "raise", amount: to });
            }}
            className="num rounded-full border border-cream/25 px-3 py-1 text-cream hover:border-brass hover:text-brass"
          >
            {legal!.isBet ? "Bet" : "Raise to"} {sliderVal}
          </button>
        </div>
      )}
    </div>
  );
}

/** Live seconds-remaining label, corrected for the server/local clock difference. */
export function Countdown({ to, label }: { to: number; label: string }) {
  const skew = useGame((s) => s.clockSkew);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((to - (now + skew)) / 1000));
  return (
    <span className="num ml-1">
      {label} {secs}s
    </span>
  );
}
