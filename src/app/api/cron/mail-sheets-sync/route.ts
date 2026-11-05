import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { syncStatusSheetExport } from "@/lib/mail-sheets-sync";

const authorized = (req: NextRequest) => cronAuthorized(req);

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
