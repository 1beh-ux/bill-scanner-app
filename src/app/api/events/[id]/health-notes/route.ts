import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, requireModuleAccess } from "@/lib/module-access";
import { healthNotesConfig } from "@/lib/health-notes-server";
import { sanitizeHealthNotes } from "@/lib/health-notes";

// Zdravotní poznámky setting (Nastavení akce -> Zdraví). Read by the settings
// block and the participant detail (which groups the health fields).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;
  const [event, fields] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { healthNotes: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return NextResponse.json({
    ...healthNotesConfig(event, fields),
    fields: fields.filter((f) => f.fieldType !== "image" && f.computedType !== "payment_qr_image").map((f) => ({ key: f.key, label: f.label, kind: f.kind })),
  });
}

/**
 * Saves the setting. Custom fields in it also get the health surfaces (and
 * lose them when removed) -- those still decide the Health-module privacy
 * gate (module-access.ts) and the participant detail's "Zdravotní poznámky" group.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const fields = await prisma.eventParticipantField.findMany({ where: { eventId, active: true } });
  const config = sanitizeHealthNotes(body.config, new Set(fields.map((f) => f.key)));
  const inConfig = new Set(config.map((c) => c.fieldKey));
  const HEALTH = ["health_list", "health_detail"] as const;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { healthNotes: config } });
    for (const f of fields.filter((x) => x.kind === "custom")) {
      const has = HEALTH.every((s) => f.surfaces.includes(s));
      if (inConfig.has(f.key) && !has) {
        await tx.eventParticipantField.update({ where: { id: f.id }, data: { surfaces: [...new Set([...f.surfaces, ...HEALTH])] } });
      } else if (!inConfig.has(f.key) && f.surfaces.some((s) => (HEALTH as readonly string[]).includes(s))) {
        await tx.eventParticipantField.update({ where: { id: f.id }, data: { surfaces: f.surfaces.filter((s) => !(HEALTH as readonly string[]).includes(s)) } });
      }
    }
  });
  return NextResponse.json({ config, isDefault: false });
}
