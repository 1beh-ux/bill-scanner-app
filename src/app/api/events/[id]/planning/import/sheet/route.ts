import { NextRequest, NextResponse } from "next/server";
import { listSheetTabs, readSheetValues, toDriveError } from "@/lib/drive";
import { httpStatusForDriveError } from "@/lib/drive-errors";
import { authorizePlanning } from "@/lib/planning-server";

// Accepts a bare spreadsheet ID or a full Sheets URL (same as the participant import).
function extractSpreadsheetId(input: string): string {
  const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (urlMatch ? urlMatch[1] : input).trim();
}

// { spreadsheetId, tab? } -> { spreadsheetId, tabs, tab, headers, rows }. Without
// `tab` (or an unknown one) the first tab is read.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const spreadsheetId = extractSpreadsheetId(typeof body.spreadsheetId === "string" ? body.spreadsheetId : "");
  if (!spreadsheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });

  try {
    const tabs = await listSheetTabs(eventId, spreadsheetId);
    const tab = typeof body.tab === "string" && tabs.includes(body.tab) ? body.tab : tabs[0];
    const values = await readSheetValues(eventId, spreadsheetId, `'${tab.replace(/'/g, "''")}'!A1:ZZ5001`);
    const [headers = [], ...rows] = values;
    return NextResponse.json({ spreadsheetId, tabs, tab, headers, rows });
  } catch (err) {
    const e = await toDriveError(eventId, err, { purpose: "read" });
    return NextResponse.json({ error: e.code, ...e.params }, { status: httpStatusForDriveError(e.code) });
  }
}
