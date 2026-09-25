import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { readSheetForImport } from "@/lib/sheet-import";

// { spreadsheetId, tab? } -> { spreadsheetId, tabs, tab, headers, rows } for the bill table import.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  return readSheetForImport(eventId, await req.json().catch(() => ({})));
}
