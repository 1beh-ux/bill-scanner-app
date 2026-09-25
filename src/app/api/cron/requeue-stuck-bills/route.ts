import { NextRequest, NextResponse } from "next/server";
import { requeueStuckBills } from "@/lib/requeue-stuck-bills";

// Hourly safety-net sweep via Cloud Scheduler (see src/lib/requeue-stuck-bills.ts).
function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, requeued: await requeueStuckBills() });
  } catch (err) {
    console.error("[requeue-stuck-bills] failed to enqueue", err);
    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 502 });
  }
}
