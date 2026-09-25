import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { extractSpreadsheetId } from "@/lib/sheet-import";
import { loadImportFields, publicSync, restrictSettings, runSavedSync, updateSyncs } from "@/lib/participant-sync-run";
import { SYNC_INTERVALS, sanitizeSettings, type ParticipantSync } from "@/lib/participant-sync";

type Ctx = { params: Promise<{ id: string; syncId: string }> };

async function guard(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  const { id: eventId, syncId } = await ctx.params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  return denied ? ({ denied } as const) : ({ user, eventId, syncId } as const);
}

/** Save a connection's settings ("new" creates one). Bookkeeping (seen keys, last run) is kept. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const body = await req.json().catch(() => ({}));
  const sheetId = extractSpreadsheetId(typeof body.sheetId === "string" ? body.sheetId : "");
  if (!sheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
  // All importable fields, not just the ones this user sees: a mail-only admin
  // saving the connection must not silently drop a health column's mapping.
  const settings = restrictSettings(sanitizeSettings(body), await loadImportFields(g.eventId));
  const id = g.syncId === "new" ? randomUUID() : g.syncId;
  const values = {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : "Tabulka",
    sheetId,
    tab: typeof body.tab === "string" ? body.tab : undefined,
    ...settings,
    autoSync: body.autoSync === true,
    everyHours: SYNC_INTERVALS.includes(body.everyHours) ? body.everyHours : 6,
  };
  let saved: ParticipantSync | undefined;
  await updateSyncs(g.eventId, (list) => {
    if (g.syncId === "new") return [...list, (saved = { id, seenKeys: [], ...values })];
    return list.map((s) => (s.id === id ? (saved = { ...s, ...values }) : s));
  });
  if (!saved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(publicSync(saved));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  await updateSyncs(g.eventId, (list) => list.filter((s) => s.id !== g.syncId));
  return NextResponse.json({ ok: true });
}

/** Sync now (the saved settings, fresh sheet). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const result = await runSavedSync(g.eventId, g.syncId, false);
  if ("error" in result && typeof result.error === "string") {
    return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return NextResponse.json(result);
}
