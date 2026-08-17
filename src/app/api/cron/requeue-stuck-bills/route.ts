import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBillAiTasks } from "@/lib/cloud-tasks";

// Cloud Tasks retries a bill's task automatically while something is still
// trying it. But if a bill is left sitting in "queued" or "processing" for
// a long time with nothing actually still working on it — the queue was
// briefly misconfigured, a task's retries were exhausted after repeated
// hard kills, whatever — nothing else in the app notices on its own. This
// sweep, run on a schedule via Cloud Scheduler (same pattern as the
// exchange-rate cron), finds bills stuck past a safe margin and re-queues
// them, so a bad run heals itself instead of needing someone to spot 80
// silently-stuck bills days later.
const STUCK_AFTER_MINUTES = 30;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
  const stuck = await prisma.bill.findMany({
    where: {
      status: { in: ["queued", "processing"] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, requeued: 0 });
  }

  const ids = stuck.map((b) => b.id);
  await prisma.bill.updateMany({ where: { id: { in: ids } }, data: { status: "queued" } });

  try {
    await enqueueBillAiTasks(ids);
  } catch (err) {
    console.error("[requeue-stuck-bills] failed to enqueue", err);
    return NextResponse.json({ ok: false, error: "enqueue_failed", found: ids.length }, { status: 502 });
  }

  return NextResponse.json({ ok: true, requeued: ids.length });
}
