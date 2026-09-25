import { NextRequest, NextResponse } from "next/server";
import { runDueSyncs } from "@/lib/participant-sync-run";

// Hourly via Cloud Scheduler: participant table connections with auto sync on,
// each at its own interval (see runDueSyncs in src/lib/participant-sync-run.ts).
function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runDueSyncs()) });
}
