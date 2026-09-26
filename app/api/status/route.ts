import { NextResponse } from "next/server";
import { jevClient } from "@/lib/jev/client";

export async function GET() {
  const client = jevClient();
  return NextResponse.json({ jev: !!client, model: client?.defaultModel ?? null });
}
