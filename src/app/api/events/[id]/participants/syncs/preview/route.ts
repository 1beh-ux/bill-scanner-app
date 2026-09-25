import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { allowedParticipantFieldKeys, requireAnyModuleAccess } from "@/lib/module-access";
import { httpStatusForDriveError } from "@/lib/drive-errors";
import { extractSpreadsheetId } from "@/lib/sheet-import";
import { applyPlan, loadImportFields, loadSyncs, planFor, readSyncSheet, type Table } from "@/lib/participant-sync-run";
import { countPlan, sanitizeSettings } from "@/lib/participant-sync";

const MAX_ROWS = 5000;
const MAX_COLS = 200;

function readTable(v: unknown): Table | null {
  if (!v || typeof v !== "object") return null;
  const { headers, rows } = v as { headers?: unknown; rows?: unknown };
  const strings = (a: unknown): a is string[] => Array.isArray(a) && a.length <= MAX_COLS && a.every((c) => typeof c === "string");
  if (!strings(headers) || !Array.isArray(rows) || rows.length > MAX_ROWS || !rows.every(strings)) return null;
  return { headers, rows };
}

/**
 * The plan for a (possibly unsaved) connection: the sheet is read when no
 * `table` is sent (the page sends the table back on re-previews so editing a
 * cell doesn't re-read Google). `run: true` applies it -- only for one-off
 * imports (pasted data / a sheet not saved as a connection); saved
 * connections sync through POST .../syncs/[syncId].
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const syncId = typeof body.syncId === "string" ? body.syncId : null;
  const run = body.run === true;
  if (run && syncId) return NextResponse.json({ error: "use_sync_route" }, { status: 400 });

  let table = body.table === undefined ? null : readTable(body.table);
  if (body.table !== undefined && !table) return NextResponse.json({ error: "invalid_table" }, { status: 400 });
  let sheetMeta: { tabs: string[]; tab: string } | null = null;
  if (!table) {
    const sheetId = extractSpreadsheetId(typeof body.sheetId === "string" ? body.sheetId : "");
    if (!sheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
    const sheet = await readSyncSheet(eventId, sheetId, body.tab);
    if ("error" in sheet) return NextResponse.json({ error: sheet.error.code, ...sheet.error.params }, { status: httpStatusForDriveError(sheet.error.code) });
    table = { headers: sheet.headers, rows: sheet.rows };
    sheetMeta = { tabs: sheet.tabs, tab: sheet.tab };
  }

  const fields = await loadImportFields(eventId, await allowedParticipantFieldKeys(user, eventId));
  const seenKeys = syncId ? ((await loadSyncs(eventId)).find((s) => s.id === syncId)?.seenKeys ?? []) : [];
  const plan = await planFor(eventId, table, sanitizeSettings(body.settings ?? {}), fields, seenKeys);
  const result = run ? await applyPlan(eventId, plan) : null;
  return NextResponse.json({
    ...table,
    ...sheetMeta,
    plan: plan.map((r) => ({ ...r, create: undefined, patch: undefined })), // the page shows `changes`
    counts: result?.counts ?? countPlan(plan),
    ran: !!result,
  });
}
