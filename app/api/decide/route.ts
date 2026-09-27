import { NextResponse } from "next/server";
import { isOwner } from "@/lib/jev/auth";
import { jevClient } from "@/lib/jev/client";
import { decisionQuestion, decisionState } from "@/lib/jev/questions";
import type { DecideRequest, DecideResponse } from "@/lib/jev/types";

export async function POST(req: Request) {
  if (!isOwner(req)) return NextResponse.json({ error: "locked" }, { status: 401 });
  const client = jevClient();
  if (!client) return NextResponse.json({ error: "no-key" }, { status: 503 });
  const body = (await req.json()) as DecideRequest;
  if (!body.options?.length) return NextResponse.json({ error: "no options" }, { status: 400 });
  const t0 = Date.now();
  try {
    const res = await client.systemOne({ state: decisionState(body), questions: decisionQuestion(body) });
    const a = res.answers.action;
    const out: DecideResponse = {
      source: "jev",
      choice: a.choice as DecideResponse["choice"],
      probabilities: a.probabilities as DecideResponse["probabilities"],
      confidence: a.confidence,
      model: res.model,
      latencyMs: Date.now() - t0,
    };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
