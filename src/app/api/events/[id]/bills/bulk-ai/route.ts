import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { enqueueBillAiTasks } from "@/lib/cloud-tasks";

// Triggers an AI run over any number of bills. This used to run the whole
// batch in-process (`Promise.all` over chunks of 3, capped at 20 bills per
// call, fired off without awaiting the result) — reliable enough for a
// handful of files, but on Cloud Run that "fire and forget after the
// response returns" pattern is exactly what let a 100-file run silently
// lose most of its bills: once the HTTP response is sent, nothing
// guarantees the instance stays alive long enough to finish the rest.
//
// Now each bill becomes one Cloud Task (src/lib/cloud-tasks.ts), which is
// durable independent of this request or this Cloud Run instance, retries
// on failure with backoff, and is rate-limited at the queue level — so
// there's no longer a batch size this endpoint needs to protect itself
// from. Select 20 bills or 500, it's the same call.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const billIds: string[] = Array.isArray(body.billIds) ? body.billIds : [];

  if (billIds.length === 0) {
    return NextResponse.json({ error: "no_bills_selected" }, { status: 400 });
  }

  const eventCategoryCount = await prisma.eventCategory.count({ where: { eventId } });
  if (eventCategoryCount === 0) {
    return NextResponse.json({ error: "no_categories" }, { status: 400 });
  }

  // Mark queued immediately so the bill list's status pills and polling
  // reflect the run starting right away, before Cloud Tasks has actually
  // picked up any individual task.
  await prisma.bill.updateMany({
    where: { id: { in: billIds } },
    data: { status: "queued" },
  });

  try {
    await enqueueBillAiTasks(billIds);
  } catch (err) {
    // Enqueueing itself failed (misconfigured queue, Cloud Tasks API
    // hiccup) — put these bills back to a visible, non-stuck state rather
    // than leaving them showing "queued" forever with nothing behind them.
    await prisma.bill.updateMany({
      where: { id: { in: billIds }, status: "queued" },
      data: { status: "new" },
    });
    console.error("[bulk-ai] failed to enqueue Cloud Tasks", err);
    return NextResponse.json({ error: "enqueue_failed" }, { status: 502 });
  }

  return NextResponse.json({ started: true, count: billIds.length });
}
