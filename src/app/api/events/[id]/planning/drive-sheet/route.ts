import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createManifestSheet, toDriveError, writeManifestValues } from "@/lib/drive";
import { httpStatusForDriveError } from "@/lib/drive-errors";
import { authorizePlanning, getPlanningSettings, loadPlanPayload, updatePlanningSettings } from "@/lib/planning-server";
import { CSV_HEADER, rowCells, scheduleRows } from "@/lib/planning-export";

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  const settings = await getPlanningSettings(eventId);
  return NextResponse.json({
    url: settings.exportSheetId ? sheetUrl(settings.exportSheetId) : null,
    syncedAt: settings.exportSyncedAt ?? null,
  });
}

// Whole-event schedule as a Google Sheet in the event's Drive export folder
// (same folder and one-way pattern as Mail's status export). Created on first
// export, overwritten in place afterwards so the link stays stable; recreated
// if the stored sheet was deleted or unshared.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, driveExportFolderId: true } });
  if (!event.driveExportFolderId) return NextResponse.json({ error: "no_export_folder" }, { status: 409 });

  const payload = await loadPlanPayload(eventId);
  const rows = [CSV_HEADER, ...scheduleRows(payload).map(rowCells)];
  const settings = await getPlanningSettings(eventId);

  try {
    let sheetId = settings.exportSheetId;
    if (sheetId) {
      try {
        await writeManifestValues(eventId, sheetId, rows);
      } catch (err) {
        if ((await toDriveError(eventId, err, { purpose: "write" })).code !== "not_found_or_no_access") throw err;
        sheetId = undefined;
      }
    }
    if (!sheetId) sheetId = await createManifestSheet(eventId, event.driveExportFolderId, `${event.name} – program`, rows);

    const syncedAt = new Date().toISOString();
    await updatePlanningSettings(eventId, { exportSheetId: sheetId, exportSyncedAt: syncedAt });
    return NextResponse.json({ url: sheetUrl(sheetId), syncedAt });
  } catch (err) {
    const e = await toDriveError(eventId, err, { purpose: "write" });
    return NextResponse.json({ error: e.code, ...e.params }, { status: httpStatusForDriveError(e.code) });
  }
}
