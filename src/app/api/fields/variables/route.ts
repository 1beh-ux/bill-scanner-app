// PUT / DELETE /api/fields/variables -- free event variables (Fields Manager phase 3a, design §4): { event (id or
// null = organization-wide), key, label, value }. Built-in and linked keys, aliases and field keys can't be used.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BUILTIN_EVENT_KEYS, EVENT_VARIABLE_ALIASES } from "@/lib/event-variables";
import { invalidateResolverContext, parseGuardianKey } from "@/lib/field-resolver";
import { fieldsManagerAccess } from "../access";

const KEY = /^[a-z][a-z0-9_]{1,39}$/;

async function target(organizationId: string, body: unknown) {
  const b = (body ?? {}) as { event?: unknown; key?: unknown; label?: unknown; value?: unknown };
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!KEY.test(key)) return { error: "invalid_key" } as const;
  let eventId: string | null = null;
  if (b.event !== null && b.event !== undefined) {
    const ev = typeof b.event === "string" ? await prisma.event.findFirst({ where: { id: b.event, organizationId }, select: { id: true } }) : null;
    if (!ev) return { error: "not_found" } as const;
    eventId = ev.id;
  }
  return { key, eventId, label: typeof b.label === "string" ? b.label.trim().slice(0, 80) : "", value: typeof b.value === "string" ? b.value.slice(0, 2000) : "" };
}

export async function PUT(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const t = await target(organizationId, await req.json().catch(() => null));
  if ("error" in t) return NextResponse.json({ error: t.error }, { status: t.error === "not_found" ? 404 : 400 });
  // A free variable may not shadow anything the resolver already knows.
  const taken =
    BUILTIN_EVENT_KEYS.has(t.key) ||
    t.key in EVENT_VARIABLE_ALIASES ||
    !!parseGuardianKey(t.key, 9) ||
    !!(await prisma.fieldAlias.findFirst({ where: { organizationId, alias: t.key }, select: { id: true } })) ||
    !!(await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key: t.key }, select: { id: true } })) ||
    !!(await prisma.eventParticipantField.findFirst({ where: { key: t.key, event: { organizationId } }, select: { id: true } }));
  if (taken) return NextResponse.json({ error: "key_taken" }, { status: 409 });
  const before = await prisma.eventVariable.findFirst({ where: { organizationId, eventId: t.eventId, key: t.key } });
  await prisma.$transaction([
    before
      ? prisma.eventVariable.update({ where: { id: before.id }, data: { label: t.label || before.label, value: t.value } })
      : prisma.eventVariable.create({ data: { organizationId, eventId: t.eventId, key: t.key, label: t.label || t.key, value: t.value } }),
    prisma.fieldChangeLog.create({ data: { organizationId, action: "variable", byId: userId, before: before ? { key: before.key, eventId: before.eventId, label: before.label, value: before.value } : undefined, after: { key: t.key, eventId: t.eventId, label: t.label, value: t.value } } }),
  ]);
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const t = await target(organizationId, await req.json().catch(() => null));
  if ("error" in t) return NextResponse.json({ error: t.error }, { status: t.error === "not_found" ? 404 : 400 });
  const before = await prisma.eventVariable.findFirst({ where: { organizationId, eventId: t.eventId, key: t.key } });
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction([
    prisma.eventVariable.delete({ where: { id: before.id } }),
    prisma.fieldChangeLog.create({ data: { organizationId, action: "variable", byId: userId, before: { key: before.key, eventId: before.eventId, label: before.label, value: before.value } } }),
  ]);
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
