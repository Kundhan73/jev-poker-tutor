"use client";

/** Where the room server lives. Local dev: wrangler on :8787. Production: your workers.dev host. */
export const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "localhost:8787";

const TOKEN_KEY = "jev-poker-token";
const NAME_KEY = "jev-poker-name";

/**
 * A secret per-browser token that identifies you to room servers (so a refresh or reconnect
 * gets your seat back). It's never shown to other players.
 */
export function playerToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    // Storage blocked (private mode): a per-tab token still works, just not across refreshes
    return (globalThis as { __jevToken?: string }).__jevToken ??= crypto.randomUUID() + crypto.randomUUID();
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {}
}
