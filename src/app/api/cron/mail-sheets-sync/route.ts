import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncStatusSheetExport } from "@/lib/mail-sheets-sync";

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
      statusExportEnabled: true,
      modules: { some: { moduleKey: "mail", enabled: true } },
    },
    select: { id: true },
  });

  let synced = 0;
  for (const event of events) {
    const result = await syncStatusSheetExport(event.id);
    if (result) synced++;
  }

  return NextResponse.json({ ok: true, eventsProcessed: events.length, synced });
}
