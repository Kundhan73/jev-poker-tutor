"use client";
import { RANKS } from "@/lib/poker/cards";

const ORDER = [...RANKS].reverse();

/** 13×13 starting-hand matrix: pairs on the diagonal, suited above, offsuit below. */
export function RangeGrid({ grid }: { grid: Record<string, number> }) {
  return (
    <div className="grid grid-cols-13 gap-px overflow-hidden rounded-md bg-black/40" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
      {ORDER.map((r1, i) =>
        ORDER.map((r2, j) => {
          const cls = i === j ? r1 + r2 : i < j ? r1 + r2 + "s" : r2 + r1 + "o";
          const w = grid[cls] ?? 0;
          return (
            <div
              key={cls}
              title={`${cls}: ${Math.round(w * 100)}%`}
              className="num flex aspect-square items-center justify-center text-[7px] leading-none sm:text-[8px]"
              style={{
                background: w > 0.01 ? `rgba(212,175,95,${0.12 + w * 0.8})` : "rgba(255,255,255,0.03)",
                color: w > 0.5 ? "#07100d" : "rgba(243,234,215,0.5)",
              }}
            >
              {cls.slice(0, 2)}
            </div>
          );
        })
      )}
    </div>
  );
}
