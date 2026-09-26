"use client";
import { useEffect } from "react";
import { ActionBar } from "@/components/ActionBar";
import { CoachPanel } from "@/components/CoachPanel";
import { HandReview } from "@/components/HandReview";
import { Header } from "@/components/Header";
import { MathBreakdown } from "@/components/MathBreakdown";
import { OpponentHUD } from "@/components/OpponentHUD";
import { PokerTable } from "@/components/PokerTable";
import { useGame } from "@/store/game";

export default function SoloPage() {
  const init = useGame((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <main className="mx-auto max-w-[1440px] pb-10">
      <Header />
      <div className="grid gap-5 px-4 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PokerTable />
          <ActionBar />
          <HandReview />
        </div>
        <aside className="flex flex-col gap-4">
          <CoachPanel />
          <MathBreakdown />
          <OpponentHUD />
        </aside>
      </div>
      <footer className="px-8 pt-8 text-center text-[11px] text-muted/70">
        Decisions by TypeSafe AI&rsquo;s Jev · equity & EV from a local Monte Carlo engine · play-money practice only
      </footer>
    </main>
  );
}
