import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncParticipantDocumentsToDrive } from "@/lib/mail-drive-sync";

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await prisma.event.findMany({
    where: {
      driveDocSyncEnabled: true,
      modules: { some: { moduleKey: "mail", enabled: true } },
    },
    select: { id: true },
  });

  let totalSynced = 0;
  let totalSkipped = 0;
  for (const event of events) {
    const { synced, skipped } = await syncParticipantDocumentsToDrive(event.id);
    totalSynced += synced;
    totalSkipped += skipped;
  }

  return NextResponse.json({ ok: true, eventsProcessed: events.length, synced: totalSynced, skipped: totalSkipped });
}
