import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Owner-only access to Jev. The owner enters OWNER_PASSCODE once; the server answers with a signed,
 * httpOnly cookie. Jev routes refuse requests without a valid cookie, so nobody else can spend the key.
 */
export const OWNER_COOKIE = "jev_owner";
const MAX_AGE_S = 60 * 60 * 24 * 30;

const passcode = () => process.env.OWNER_PASSCODE?.trim() || "";

const sign = (payload: string, secret: string) =>
  createHmac("sha256", `${secret}:jev-owner-cookie`).update(payload).digest("base64url");

const sameText = (a: string, b: string) => {
  // Hash first so both sides have equal length, then compare in constant time
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export function checkPasscode(attempt: string): boolean {
  const secret = passcode();
  return !!secret && sameText(attempt, secret);
}

/** Cookie value: "<expiry>.<signature>". Changing OWNER_PASSCODE invalidates every cookie. */
export function makeOwnerToken(now = Date.now()): string {
  const expiry = String(Math.floor(now / 1000) + MAX_AGE_S);
  return `${expiry}.${sign(expiry, passcode())}`;
}

export const ownerCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_S,
};

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * Is this request from the owner? Without OWNER_PASSCODE, only local development is trusted;
 * a production deployment with no passcode refuses everyone (fail closed).
 */
export function isOwner(req: Request, now = Date.now()): boolean {
  const secret = passcode();
  if (!secret) return process.env.NODE_ENV !== "production";
  const token = readCookie(req, OWNER_COOKIE);
  if (!token) return false;
  const [expiry, sig] = token.split(".");
  if (!expiry || !sig || Number(expiry) * 1000 < now) return false;
  return sameText(sig, sign(expiry, secret));
}
