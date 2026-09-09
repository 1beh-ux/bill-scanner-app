import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { readSheetValues, getDriveServiceAccountEmail } from "@/lib/drive";

// Accepts either a bare spreadsheet ID or a full Sheets URL and pulls the ID
// out of either — same shape a user would paste from their browser bar.
function extractSpreadsheetId(input: string): string {
  const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (urlMatch ? urlMatch[1] : input).trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const raw = typeof body.spreadsheetId === "string" ? body.spreadsheetId : "";
  const spreadsheetId = extractSpreadsheetId(raw);
  if (!spreadsheetId) {
    return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
  }

  try {
    const values = await readSheetValues(spreadsheetId);
    const [headerRow, ...dataRows] = values;
    return NextResponse.json({ headers: headerRow ?? [], rows: dataRows });
  } catch (err) {
    console.log("[sheets-preview] read failed:", String(err));
    return NextResponse.json(
      { error: "sheet_read_failed", serviceAccountEmail: getDriveServiceAccountEmail() },
      { status: 422 }
    );
  }
}
