import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createManifestSheet, toDriveError, writeFormattedSheet } from "@/lib/drive";
import { getCurrentUser } from "@/lib/auth";
import { buildSheetModel, sheetInputFromPayload } from "@/lib/planning-sheet";
import { sanitizeUiPrefs, UI_PREF_DEFAULTS } from "@/lib/ui-prefs";
import { httpStatusForDriveError } from "@/lib/drive-errors";
import { authorizePlanning, getPlanningSettings, loadPlanPayload, updatePlanningSettings } from "@/lib/planning-server";

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

// Whole-event schedule as a designed Google Sheet (src/lib/planning-sheet.ts)
// in the event's Drive export folder -- same folder and one-way pattern as
// Mail's status export. Created on first export, overwritten in place
// afterwards so the link stays stable; recreated if deleted or unshared. The
// design is the exporting user's own (Nastavení -> vzhled exportu).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, driveExportFolderId: true } });
  if (!event.driveExportFolderId) return NextResponse.json({ error: "no_export_folder" }, { status: 409 });

  const [payload, settings, user] = await Promise.all([loadPlanPayload(eventId), getPlanningSettings(eventId), getCurrentUser()]);
  const style = sanitizeUiPrefs(user?.uiPrefs).planningSheetStyle ?? UI_PREF_DEFAULTS.planningSheetStyle;
  const model = buildSheetModel(sheetInputFromPayload(payload), style);

  try {
    let sheetId = settings.exportSheetId;
    if (sheetId) {
      try {
        await writeFormattedSheet(eventId, sheetId, model, style.fontSize);
      } catch (err) {
        if ((await toDriveError(eventId, err, { purpose: "write" })).code !== "not_found_or_no_access") throw err;
        sheetId = undefined;
      }
    }
    if (!sheetId) {
      sheetId = await createManifestSheet(eventId, event.driveExportFolderId, `${event.name} – program`, [[""]]);
      await writeFormattedSheet(eventId, sheetId, model, style.fontSize);
    }

    const syncedAt = new Date().toISOString();
    await updatePlanningSettings(eventId, { exportSheetId: sheetId, exportSyncedAt: syncedAt });
    return NextResponse.json({ url: sheetUrl(sheetId), syncedAt });
  } catch (err) {
    const e = await toDriveError(eventId, err, { purpose: "write" });
    return NextResponse.json({ error: e.code, ...e.params }, { status: httpStatusForDriveError(e.code) });
  }
}
