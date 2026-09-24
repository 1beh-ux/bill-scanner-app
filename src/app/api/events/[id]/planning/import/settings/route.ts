import { NextRequest, NextResponse } from "next/server";
import { authorizePlanning, getPlanningSettings, updatePlanningSettings } from "@/lib/planning-server";
import { PLAN_IMPORT_TARGETS, type PlanImportTarget } from "@/lib/planning";
import { IMPORT_FIELDS } from "@/lib/planning-import";

// Saved sheet connections per import target (Event.planningSettings.imports).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  return NextResponse.json((await getPlanningSettings(eventId)).imports ?? {});
}

// { target, connection: { sheetId, tab?, mapping: {header: fieldKey} } | null }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const target = body.target as PlanImportTarget;
  if (!PLAN_IMPORT_TARGETS.includes(target)) return NextResponse.json({ error: "invalid_target" }, { status: 400 });

  const imports = { ...(await getPlanningSettings(eventId)).imports };
  const c = body.connection;
  if (c === null) {
    delete imports[target];
  } else {
    const keys = new Set(IMPORT_FIELDS[target].map((f) => f.key));
    if (!c || typeof c.sheetId !== "string" || !c.sheetId.trim() || typeof c.mapping !== "object" || c.mapping === null) {
      return NextResponse.json({ error: "invalid_connection" }, { status: 400 });
    }
    const mapping = Object.fromEntries(
      Object.entries(c.mapping as Record<string, unknown>).filter(([h, k]) => h.length <= 200 && typeof k === "string" && keys.has(k))
    ) as Record<string, string>;
    imports[target] = { sheetId: c.sheetId.trim(), tab: typeof c.tab === "string" ? c.tab : undefined, mapping };
  }
  await updatePlanningSettings(eventId, { imports });
  return NextResponse.json(imports);
}
