import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/request-security";
import { runDueSyncs } from "@/lib/participant-sync-run";

// Hourly via Cloud Scheduler: participant table connections with auto sync on,
// each at its own interval (see runDueSyncs in src/lib/participant-sync-run.ts).
const authorized = (req: NextRequest) => cronAuthorized(req);

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runDueSyncs()) });
}
