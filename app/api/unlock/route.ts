import { NextResponse } from "next/server";
import { checkPasscode, makeOwnerToken, OWNER_COOKIE, ownerCookieOptions } from "@/lib/jev/auth";

/** Unlock Jev for this browser with the owner passcode. */
export async function POST(req: Request) {
  let attempt = "";
  try {
    attempt = String((await req.json()).passcode ?? "");
  } catch {}
  if (!checkPasscode(attempt)) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, makeOwnerToken(), ownerCookieOptions);
  return res;
}

/** Lock Jev again on this browser. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, "", { ...ownerCookieOptions, maxAge: 0 });
  return res;
}
