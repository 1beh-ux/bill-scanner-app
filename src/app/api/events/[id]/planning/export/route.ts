import { NextRequest, NextResponse } from "next/server";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";
import { scheduleRows } from "@/lib/planning-export";

// CSV of the schedule (the old Export_Schedule sheet). ?day=<dayId> or all days;
// ?leader=<leaderId> narrows to one leader's blocks, ?group=<name> to one
// participant group's (plus blocks for everyone). Semicolon-separated with a
// BOM so Czech Excel opens it straight into columns.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const search = new URL(req.url).searchParams;
  const day = search.get("day");
  const leader = search.get("leader");
  const group = search.get("group");
  const payload = await loadPlanPayload(eventId);
  const rows = scheduleRows(payload, { dayIds: day ? new Set([day]) : undefined, leaderId: leader ?? undefined, group: group ?? undefined });

  const header = ["Den", "Datum", "Okno", "Začátek okna", "Konec okna", "Začátek", "Konec", "Délka (min)", "Souběžně", "Aktivita", "Popis", "Hlavní kategorie", "Vedlejší kategorie", "Vedoucí", "Místo", "Skupiny", "Poznámka"];
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header,
    ...rows.map((r) => [r.dayLabel, r.date ?? "", r.windowName, r.windowStart, r.windowEnd, r.start, r.end, r.durationMin, r.parallel ? "ano" : "", r.activity, r.description, r.primaryCategory, r.secondaryCategory, r.leader, r.location, r.groups, r.notes]),
  ].map((cols) => cols.map(cell).join(";"));

  const filename = `program-${payload.event.name.normalize("NFD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.csv`;
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
