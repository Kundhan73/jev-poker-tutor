"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import usePartySocket from "partysocket/react";
import { ActionBar } from "@/components/ActionBar";
import { CoachPanel } from "@/components/CoachPanel";
import { HandReview } from "@/components/HandReview";
import { MathBreakdown } from "@/components/MathBreakdown";
import { OpponentHUD } from "@/components/OpponentHUD";
import { PokerTable } from "@/components/PokerTable";
import { RoomPanel } from "@/components/RoomPanel";
import { PARTY_HOST, playerToken, saveName, savedName } from "@/lib/room/identity";
import { PARTY, type ClientMessage, type ServerMessage } from "@/lib/room/protocol";
import { useGame } from "@/store/game";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const roomCode = String(code).toUpperCase();
  // Read from localStorage on the client only (null during server rendering)
  const token = useSyncExternalStore(noopSubscribe, playerToken, () => null);
  if (!token) return null;
  return <Room code={roomCode} token={token} />;
}

const noopSubscribe = () => () => {};

function Room({ code, token }: { code: string; token: string }) {
  const enterRoom = useGame((s) => s.enterRoom);
  const applyRoomView = useGame((s) => s.applyRoomView);
  const checkJev = useGame((s) => s.checkJev);
  const room = useGame((s) => s.room);
  const coachOn = useGame((s) => s.coachOn);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socket = usePartySocket({
    host: PARTY_HOST,
    party: PARTY,
    room: code,
    query: { token },
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onMessage: (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === "state") applyRoomView(msg.view);
      else {
        setError(msg.message);
        setTimeout(() => setError(null), 3500);
      }
    },
  });
  const send = useCallback((m: ClientMessage) => socket.send(JSON.stringify(m)), [socket]);

  useEffect(() => {
    enterRoom(send);
    void checkJev();
  }, [enterRoom, checkJev, send]);

  const seated = !!room?.mySeatId;

  return (
    <main className="mx-auto max-w-[1440px] pb-10">
      <header className="flex items-end justify-between gap-4 px-4 pt-5 sm:px-8">
        <Link href="/" className="font-display text-3xl leading-none sm:text-4xl">
          Jev <span className="italic text-brass">Poker</span>
        </Link>
        <span className="num text-xs text-muted">room {code}</span>
      </header>
      {error && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-bad/50 bg-ink px-4 py-2 text-sm text-bad">
          {error}
        </div>
      )}
      <div className="grid gap-5 px-4 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PokerTable
            onSit={seated ? undefined : (seatIndex) => {
              const name = savedName();
              if (name) send({ type: "sit", name, seatIndex });
              else document.getElementById("name-input")?.focus();
            }}
            onAddBot={(seatIndex) => send({ type: "addBot", seatIndex })}
          />
          {room && !seated && <JoinForm onJoin={(name) => send({ type: "sit", name })} />}
          {seated && <ActionBar />}
          {seated && <HandReview />}
        </div>
        <aside className="flex flex-col gap-4">
          <RoomPanel send={send} connected={connected} />
          {coachOn && <CoachPanel />}
          {coachOn && <MathBreakdown />}
          {coachOn && <OpponentHUD />}
          {!room && <div className="panel rounded-2xl p-4 text-sm text-muted">Connecting to room {code}…</div>}
        </aside>
      </div>
    </main>
  );
}

function JoinForm({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState(savedName());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        saveName(n);
        onJoin(n);
      }}
      className="panel mx-auto flex w-full max-w-md items-center gap-2 rounded-full p-1.5 pl-5"
    >
      <input
        id="name-input"
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-cream/30"
      />
      <button className="rounded-full bg-brass px-5 py-2 text-sm font-bold text-ink">Take a seat</button>
    </form>
  );
}
