import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { BILL_IMPORT_FIELDS } from "@/lib/bills-import";
import { runBillImport } from "@/lib/bills-import-run";

// Real runs download one Drive file per row -- the client sends them in small
// chunks (with rowOffset) so each request stays well inside the timeout.
const MAX_DRY_ROWS = 5000;
const MAX_RUN_ROWS = 25;

// { records: [{fieldKey: rawText}], options: {approveComplete, createMissing}, dryRun, rowOffset }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  if (!Array.isArray(body.records) || body.records.length > (dryRun ? MAX_DRY_ROWS : MAX_RUN_ROWS)) {
    return NextResponse.json({ error: "invalid_records" }, { status: 400 });
  }
  const keys = new Set(BILL_IMPORT_FIELDS.map((f) => f.key));
  const records = body.records.map((r: unknown) =>
    Object.fromEntries(
      Object.entries(r && typeof r === "object" ? r : {}).filter(([k, v]) => keys.has(k) && typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 2000)])
    )
  );
  const options = { approveComplete: body.options?.approveComplete === true, createMissing: body.options?.createMissing !== false };
  const rowOffset = Number.isInteger(body.rowOffset) && body.rowOffset >= 0 ? body.rowOffset : 0;
  const rowNumbers =
    Array.isArray(body.rowNumbers) && body.rowNumbers.length === records.length && body.rowNumbers.every((n: unknown) => Number.isInteger(n) && (n as number) >= 0)
      ? (body.rowNumbers as number[])
      : undefined;
  return NextResponse.json(await runBillImport(eventId, user.id, records, options, dryRun, rowOffset, rowNumbers));
}
