import { NextRequest } from "next/server";
import { authorizePlanning } from "@/lib/planning-server";
import { readSheetForImport } from "@/lib/sheet-import";

// { spreadsheetId, tab? } -> { spreadsheetId, tabs, tab, headers, rows } (first tab by default).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  return readSheetForImport(eventId, await req.json().catch(() => ({})));
}
