import { NextRequest, NextResponse } from "next/server";
import { authorizePlanning } from "@/lib/planning-server";
import { PLAN_IMPORT_TARGETS, type PlanImportTarget } from "@/lib/planning";
import { IMPORT_FIELDS } from "@/lib/planning-import";
import { runImport, type ImportRecord } from "@/lib/planning-import-run";

const MAX_ROWS = 5000;

// { target, records: [{fieldKey: rawText}], options: {mode, createMissing}, dryRun }
// dryRun = the preview; same code path as the real import.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const target = body.target as PlanImportTarget;
  if (!PLAN_IMPORT_TARGETS.includes(target)) return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  if (!Array.isArray(body.records) || body.records.length > MAX_ROWS) return NextResponse.json({ error: "invalid_records" }, { status: 400 });

  // Keep only known field keys with string values.
  const keys = new Set(IMPORT_FIELDS[target].map((f) => f.key));
  const records: ImportRecord[] = body.records.map((r: unknown) =>
    Object.fromEntries(
      Object.entries(r && typeof r === "object" ? r : {}).filter(([k, v]) => keys.has(k) && typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 2000)])
    )
  );
  const options = {
    mode: body.options?.mode === "append" ? ("append" as const) : ("replace" as const),
    createMissing: body.options?.createMissing !== false,
  };

  return NextResponse.json(await runImport(eventId, target, records, options, body.dryRun !== false));
}
