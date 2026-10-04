import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { allowedParticipantFieldKeys, requireAnyModuleAccess, requireModuleAccess } from "@/lib/module-access";
import { healthNotesConfig, saveHealthNotesConfig } from "@/lib/health-notes-server";
import { readParticipantLayout, sanitizePageLayout } from "@/lib/participant-layout";

// Participant detail / Zdraví detail layout ("Upravit rozvržení" on those pages).
// GET also returns what the editor needs: the fields and the health-notes config.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;
  const [event, fields, allowedKeys] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { healthNotes: true, participantLayout: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    allowedParticipantFieldKeys(user, eventId),
  ]);
  const { config, isDefault } = healthNotesConfig(event, fields);
  return NextResponse.json({
    layout: event.participantLayout ?? null,
    // Same visibility as /participant-fields (a mail-only grant doesn't see health-only fields).
    fields: fields.filter((f) => allowedKeys.has(f.key)),
    healthConfig: config,
    isDefaultHealth: isDefault,
  });
}

/**
 * Body { page, layout, fieldOrder?, healthConfig? }: saves that page's layout
 * (keeping the other page's), sets the custom fields' sortOrder to fieldOrder,
 * and saves the health-notes config (health access only).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const page = body.page === "health" ? "health" : body.page === "detail" ? "detail" : body.page === "portal" ? "portal" : null;
  if (!page) return NextResponse.json({ error: "invalid_page" }, { status: 400 });
  const denied =
    page === "health" || body.healthConfig !== undefined
      ? await requireModuleAccess(user, eventId, "health")
      : await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const [event, fields] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { participantLayout: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true } }),
  ]);
  const layout = sanitizePageLayout(body.layout, page, new Set(fields.map((f) => f.key)));
  if (!layout) return NextResponse.json({ error: "invalid_layout" }, { status: 400 });
  const stored = { ...readParticipantLayout(event.participantLayout), [page]: layout };

  const order: unknown[] = Array.isArray(body.fieldOrder) ? body.fieldOrder.slice(0, 500) : [];
  const custom = new Map(fields.filter((f) => f.kind === "custom").map((f) => [f.key, f]));
  const reorder = [];
  for (const [i, key] of order.entries()) {
    const f = typeof key === "string" ? custom.get(key) : undefined;
    if (f && f.sortOrder !== i) reorder.push(prisma.eventParticipantField.update({ where: { id: f.id }, data: { sortOrder: i } }));
  }
  await prisma.$transaction([
    prisma.event.update({ where: { id: eventId }, data: { participantLayout: JSON.parse(JSON.stringify(stored)) } }),
    ...reorder,
  ]);
  if (body.healthConfig !== undefined) await saveHealthNotesConfig(eventId, body.healthConfig);
  return NextResponse.json({ ok: true });
}
