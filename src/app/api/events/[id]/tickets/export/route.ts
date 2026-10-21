import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { exportOrdersToDrive, orderRows } from "@/lib/tickets-export";
import { DriveError, httpStatusForDriveError } from "@/lib/drive-errors";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Orders as CSV (semicolons + BOM: opens straight in Czech Excel), one row per order.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  const csv = "\uFEFF" + (await orderRows(eventId)).map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="objednavky.csv"` } });
}

// The same rows as a Google Sheet in the export folder (src/lib/tickets-export.ts).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  try {
    const r = await exportOrdersToDrive(eventId);
    if ("error" in r) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, url: `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit` });
  } catch (err) {
    if (err instanceof DriveError) return NextResponse.json({ error: err.code, ...err.params }, { status: httpStatusForDriveError(err.code) });
    throw err;
  }
}
