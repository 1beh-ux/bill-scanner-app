import { NextRequest, NextResponse } from "next/server";
import type { ModuleKey } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { syncParticipantFieldsForEvent } from "@/lib/participant-field-sync";
import { isOrgAdmin, requireEventInOrg } from "@/lib/org-scope";
import { moduleChanges, modulesOfKind } from "@/lib/module-kinds";



export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const [rows, event] = await Promise.all([prisma.eventModule.findMany({ where: { eventId } }), prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { kind: true } })]);
  const enabledByKey = new Map(rows.map((r) => [r.moduleKey, r.enabled]));

  return NextResponse.json(
    modulesOfKind(event.kind).map((key) => ({
      moduleKey: key,
      enabled: enabledByKey.get(key) ?? false,
    }))
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const { id: eventId } = await params;
  const inOrg = await requireEventInOrg(user, eventId);
  if ("error" in inOrg) return inOrg.error;
  const body = await req.json().catch(() => ({}));
  const moduleKey: ModuleKey | undefined = body.moduleKey;
  const enabled: unknown = body.enabled;

  if (!moduleKey || !modulesOfKind(inOrg.event.kind).includes(moduleKey) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Dependencies (src/lib/module-kinds.ts): Zdraví / Pošta / Přihláška / Portál bring Děti along, Děti off
  // takes them off too. Data always stays; only the switches move.
  const offered = modulesOfKind(inOrg.event.kind);
  const changes = moduleChanges(moduleKey, enabled).filter((c) => offered.includes(c.key));
  const before = new Map((await prisma.eventModule.findMany({ where: { eventId, moduleKey: { in: changes.map((c) => c.key) } } })).map((m) => [m.moduleKey, m.enabled]));
  let updated = null;
  for (const c of changes) {
    if (c.key !== moduleKey && (before.get(c.key) ?? false) === c.enabled) continue;
    const row = await prisma.eventModule.upsert({
      where: { eventId_moduleKey: { eventId, moduleKey: c.key } },
      create: { eventId, moduleKey: c.key, enabled: c.enabled },
      update: { enabled: c.enabled },
    });
    if (c.key === moduleKey) updated = row;
    // Newly enabled: pull in any org-template participant fields meant for this module (see
    // src/lib/participant-field-sync.ts) so the Účastníci tab isn't empty for a module just turned on.
    if (c.enabled && !(before.get(c.key) ?? false)) await syncParticipantFieldsForEvent(eventId, c.key);
  }

  // Every switch that moved (the page shows the dependent ones flip too).
  return NextResponse.json({ ...updated, changed: changes });
}
