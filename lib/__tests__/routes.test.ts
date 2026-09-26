import { beforeEach, describe, expect, it, vi } from "vitest";

const systemOne = vi.fn();
let hasKey = true;
vi.mock("@/lib/jev/client", () => ({
  jevClient: () => (hasKey ? { systemOne, defaultModel: "jev-test" } : null),
}));

const { POST: decide } = await import("@/app/api/decide/route");
const { POST: read } = await import("@/app/api/read-opponent/route");

const decideBody = {
  hero: { cards: "As Ah", handClass: "AA", position: "BB", stack: 198 },
  street: "preflop",
  board: "",
  pot: 203,
  toCall: 198,
  potOdds: 0.49,
  spr: 0,
  texture: null,
  equity: 0.82,
  opponents: [],
  history: [],
  options: [
    { id: "fold", label: "Fold", cost: 0, evChips: 0 },
    { id: "call", label: "Call 198", cost: 198, evChips: 120 },
  ],
};

const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

describe("api routes", () => {
  beforeEach(() => {
    systemOne.mockReset();
    hasKey = true;
  });

  it("decide returns Jev's choice and probabilities", async () => {
    systemOne.mockResolvedValue({
      model: "jev-test",
      answers: { action: { type: "choice", choice: "call", confidence: 0.97, probabilities: { fold: 0.03, call: 0.97 } } },
    });
    const res = await decide(post(decideBody));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ source: "jev", choice: "call", confidence: 0.97 });
    const sent = systemOne.mock.calls[0][0];
    expect(Object.keys(sent.questions.action.criteria)).toEqual(["fold", "call"]);
    expect(sent.state.hero.cards).toBe("As Ah");
  });

  it("decide returns 503 without an API key so the client falls back to math", async () => {
    hasKey = false;
    const res = await decide(post(decideBody));
    expect(res.status).toBe(503);
  });

  it("decide surfaces Jev errors as 502", async () => {
    systemOne.mockRejectedValue(new Error("rate limited"));
    const res = await decide(post(decideBody));
    expect(res.status).toBe(502);
  });

  it("read-opponent normalises scores and only asks about bluffing after aggression", async () => {
    systemOne.mockResolvedValue({
      model: "jev-test",
      answers: {
        aggression: { score: 4, confidence: 0.8 },
        looseness: { score: 2, confidence: 0.7 },
        range_strength: { score: 1, confidence: 0.6 },
        bluffing: { noul: 0.7 },
      },
    });
    const body = {
      opponent: { name: "Ava", position: "CO", stack: 180, stats: {} },
      street: "flop",
      board: "Ah 7c 2d",
      pot: 20,
      thisHand: [],
      lastWasAggressive: true,
    };
    const j = await (await read(post(body))).json();
    expect(j).toMatchObject({ aggression: 1, looseness: 0.5, rangeStrength: 0.25, bluffing: 0.7, source: "jev" });
    expect(systemOne.mock.calls[0][0].questions.bluffing).toBeDefined();

    await read(post({ ...body, lastWasAggressive: false }));
    expect(systemOne.mock.calls[1][0].questions.bluffing).toBeUndefined();
  });
});
