import { NextResponse } from "next/server";
import { isOwner } from "@/lib/jev/auth";
import { jevClient } from "@/lib/jev/client";

export async function GET(req: Request) {
  const client = jevClient();
  const owner = isOwner(req);
  return NextResponse.json({
    jev: !!client && owner,
    // A key exists but this browser hasn't been unlocked with the owner passcode
    locked: !!client && !owner,
    model: owner ? client?.defaultModel ?? null : null,
  });
}
