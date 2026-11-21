// PATCH /api/fields/<key>?event=<id> -- Fields Manager phase 3a: a field's storage scope (decision A), the
// organization's "required" default and the selected event's "required" (decision B). Admins of a flagged
// organization only; every change is logged with before/after (FieldChangeLog).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess, pickEvent } from "../access";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const { key } = await params;
  const body = await req.json().catch(() => null);
  const { storage, requiredDefault, required } = (body ?? {}) as { storage?: unknown; requiredDefault?: unknown; required?: unknown };
  if (storage !== undefined && storage !== "profile" && storage !== "event") return NextResponse.json({ error: "invalid_storage" }, { status: 400 });
  if (requiredDefault !== undefined && typeof requiredDefault !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (required !== undefined && typeof required !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const template = await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key } });
  if ((storage !== undefined || requiredDefault !== undefined) && !template) return NextResponse.json({ error: "no_template" }, { status: 400 });
  const { selected } = await pickEvent(organizationId, req.nextUrl.searchParams.get("event"));
  const eventField = required !== undefined && selected ? await prisma.eventParticipantField.findFirst({ where: { eventId: selected.id, key, kind: "custom" } }) : null;
  if (required !== undefined && !eventField) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (template && (storage !== undefined || requiredDefault !== undefined)) {
      await tx.participantFieldTemplate.update({ where: { id: template.id }, data: { ...(storage !== undefined && { storage }), ...(requiredDefault !== undefined && { requiredInRegistration: requiredDefault }) } });
    }
    if (eventField && required !== undefined) await tx.eventParticipantField.update({ where: { id: eventField.id }, data: { requiredOnRegistration: required } });
    await tx.fieldChangeLog.create({
      data: {
        organizationId,
        action: "edit",
        byId: userId,
        before: { key, eventId: eventField?.eventId ?? null, storage: template?.storage ?? null, requiredDefault: template?.requiredInRegistration ?? null, required: eventField?.requiredOnRegistration ?? null },
        after: { key, eventId: eventField?.eventId ?? null, ...(storage !== undefined && { storage }), ...(requiredDefault !== undefined && { requiredDefault }), ...(required !== undefined && { required }) },
      },
    });
  });
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
