import { NextResponse } from "next/server";
import { listSheetTabs, readSheetValues, toDriveError } from "@/lib/drive";
import { httpStatusForDriveError } from "@/lib/drive-errors";

// Shared by the table imports (planning, bills): a Sheets link or bare id plus
// an optional tab -> { spreadsheetId, tabs, tab, headers, rows } as a response,
// or the Drive error code (+ identity params) the UI renders via driveErrorText.
export function extractSpreadsheetId(input: string): string {
  const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (urlMatch ? urlMatch[1] : input).trim();
}

export async function readSheetForImport(eventId: string, body: { spreadsheetId?: unknown; tab?: unknown }): Promise<NextResponse> {
  const spreadsheetId = extractSpreadsheetId(typeof body.spreadsheetId === "string" ? body.spreadsheetId : "");
  if (!spreadsheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
  try {
    return NextResponse.json({ spreadsheetId, ...(await readSheetTable(eventId, spreadsheetId, body.tab)) });
  } catch (err) {
    const e = await toDriveError(eventId, err, { purpose: "read" });
    return NextResponse.json({ error: e.code, ...e.params }, { status: httpStatusForDriveError(e.code) });
  }
}

/** One tab (the named one if it exists, else the first) as header row + data rows. Throws Drive errors. */
export async function readSheetTable(eventId: string, spreadsheetId: string, wantedTab?: unknown) {
  const tabs = await listSheetTabs(eventId, spreadsheetId);
  const tab = typeof wantedTab === "string" && tabs.includes(wantedTab) ? wantedTab : tabs[0];
  const values = await readSheetValues(eventId, spreadsheetId, `'${tab.replace(/'/g, "''")}'!A1:ZZ5001`);
  const [headers = [], ...rows] = values;
  return { tabs, tab, headers, rows };
}
