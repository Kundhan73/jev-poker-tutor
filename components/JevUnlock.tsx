"use client";
import { useState } from "react";
import { useGame } from "@/store/game";

/** Lets the owner unlock Jev on this browser with the owner passcode (or lock it again). */
export function JevUnlock() {
  const jev = useGame((s) => s.jev);
  const checkJev = useGame((s) => s.checkJev);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!jev.checked) return null;
  if (!jev.locked) return null;

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-brass/40 px-2.5 py-1 text-xs font-semibold text-brass hover:bg-brass/10"
        title="Jev is only available to the owner of this site"
      >
        🔒 Unlock Jev
      </button>
    );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await fetch("/api/unlock", { method: "POST", body: JSON.stringify({ passcode: code }) });
          if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
          setCode("");
          setOpen(false);
          await checkJev();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="flex items-center gap-1.5 text-xs"
    >
      <input
        type="password"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Owner passcode"
        aria-label="Owner passcode"
        className="w-36 rounded-full border border-cream/20 bg-black/30 px-3 py-1 outline-none focus:border-brass"
      />
      <button disabled={busy || !code} className="rounded-full bg-brass px-3 py-1 font-bold text-ink disabled:opacity-40">
        {busy ? "…" : "Unlock"}
      </button>
      {error && <span className="text-bad">{error}</span>}
    </form>
  );
}
