import { prisma } from "@/lib/prisma";
import { enqueueBillAiTasks } from "@/lib/cloud-tasks";

// Cloud Tasks retries each bill's task itself (bill-ai-queue: 5 attempts,
// backoff up to 5 min). This catches what falls through -- retries exhausted,
// a task lost to a misconfigured queue: bills left "queued"/"processing" past
// a safe margin are put back on the queue. Called from two places:
// - the hourly Cloud Scheduler sweep (api/cron/requeue-stuck-bills), all events;
// - the bill list load, for that event -- so stuck bills heal the moment
//   someone looks, without paying for frequent polling.
const STUCK_AFTER_MINUTES = 30;

export async function requeueStuckBills(eventId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
  const stuck = await prisma.bill.findMany({
    where: { status: { in: ["queued", "processing"] }, updatedAt: { lt: cutoff }, ...(eventId && { eventId }) },
    select: { id: true },
  });
  if (stuck.length === 0) return 0;

  const ids = stuck.map((b) => b.id);
  // Bumps updatedAt too, so the next sweep/list load within the margin won't re-enqueue.
  await prisma.bill.updateMany({ where: { id: { in: ids } }, data: { status: "queued" } });
  await enqueueBillAiTasks(ids);
  return ids.length;
}
