import { NextResponse } from "next/server";
import { isOwner } from "@/lib/jev/auth";
import { jevClient } from "@/lib/jev/client";
import {
  AGGRESSION_RUBRIC,
  LOOSENESS_RUBRIC,
  normScore,
  RANGE_STRENGTH_RUBRIC,
  readQuestions,
  readState,
} from "@/lib/jev/questions";
import type { ReadRequest, ReadResponse } from "@/lib/jev/types";

export async function POST(req: Request) {
  if (!isOwner(req)) return NextResponse.json({ error: "locked" }, { status: 401 });
  const client = jevClient();
  if (!client) return NextResponse.json({ error: "no-key" }, { status: 503 });
  const body = (await req.json()) as ReadRequest;
  const t0 = Date.now();
  try {
    const res = await client.systemOne({ state: readState(body), questions: readQuestions(body) });
    const a = res.answers as Record<string, { score?: number; noul?: number; confidence?: number }>;
    const out: ReadResponse = {
      aggression: normScore(a.aggression.score!, AGGRESSION_RUBRIC.length),
      looseness: normScore(a.looseness.score!, LOOSENESS_RUBRIC.length),
      rangeStrength: normScore(a.range_strength.score!, RANGE_STRENGTH_RUBRIC.length),
      // Only asked when the opponent's last action was a bet/raise
      bluffing: a.bluffing?.noul ?? 0.2,
      confidence: a.range_strength.confidence,
      source: "jev",
      latencyMs: Date.now() - t0,
    };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
