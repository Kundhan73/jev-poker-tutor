import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const systemOne = vi.fn();
vi.mock("@/lib/jev/client", () => ({ jevClient: () => ({ systemOne, defaultModel: "jev-test" }) }));

const { isOwner, makeOwnerToken, OWNER_COOKIE } = await import("@/lib/jev/auth");
const { POST: unlock } = await import("@/app/api/unlock/route");
const { POST: decide } = await import("@/app/api/decide/route");
const { GET: status } = await import("@/app/api/status/route");

const PASS = "correct horse battery staple";
const withCookie = (cookie?: string, body?: unknown) =>
  new Request("http://x/api", {
    method: body ? "POST" : "GET",
    headers: cookie ? { cookie } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
const decideBody = { options: [{ id: "fold", label: "Fold", cost: 0, evChips: 0 }], opponents: [], history: [], hero: {}, equity: 0.5 };

describe("owner-only Jev access", () => {
  beforeEach(() => {
    vi.stubEnv("OWNER_PASSCODE", PASS);
    vi.stubEnv("NODE_ENV", "production");
    systemOne.mockReset();
    systemOne.mockResolvedValue({ model: "jev-test", answers: { action: { choice: "fold", confidence: 1, probabilities: { fold: 1 } } } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects Jev calls without the owner cookie and never touches the key", async () => {
    const res = await decide(withCookie(undefined, decideBody));
    expect(res.status).toBe(401);
    expect(systemOne).not.toHaveBeenCalled();
    const s = await (await status(withCookie())).json();
    expect(s).toMatchObject({ jev: false, locked: true, model: null });
  });

  it("rejects a wrong passcode", async () => {
    const res = await unlock(withCookie(undefined, { passcode: "guess" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("unlocks with the right passcode, then Jev calls work", async () => {
    const res = await unlock(withCookie(undefined, { passcode: PASS }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${OWNER_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    const cookie = setCookie.split(";")[0];
    expect((await decide(withCookie(cookie, decideBody))).status).toBe(200);
    expect(systemOne).toHaveBeenCalledTimes(1);
  });

  it("rejects forged, expired, and old-passcode cookies", () => {
    const good = makeOwnerToken();
    const [exp, sig] = good.split(".");
    const req = (v: string) => withCookie(`${OWNER_COOKIE}=${v}`);
    expect(isOwner(req(good))).toBe(true);
    expect(isOwner(req(`${Number(exp) + 999999}.${sig}`))).toBe(false); // extended expiry, same signature
    expect(isOwner(req(`${exp}.AAAA`))).toBe(false);
    expect(isOwner(req(makeOwnerToken(Date.now() - 31 * 86400 * 1000)))).toBe(false); // expired
    vi.stubEnv("OWNER_PASSCODE", "a new passcode");
    expect(isOwner(req(good))).toBe(false); // changing the passcode revokes old cookies
  });

  it("fails closed in production when no passcode is configured", async () => {
    vi.stubEnv("OWNER_PASSCODE", "");
    expect((await decide(withCookie(undefined, decideBody))).status).toBe(401);
    expect((await unlock(withCookie(undefined, { passcode: "" }))).status).toBe(401);
  });

  it("allows local development without a passcode", () => {
    vi.stubEnv("OWNER_PASSCODE", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isOwner(withCookie())).toBe(true);
  });
});
