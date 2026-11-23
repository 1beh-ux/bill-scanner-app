// PATCH /api/fields/<key>?event=<id> -- edit a field from the Fields Manager's panel (phase 3a + redesign R7–R14):
//   storage, requiredDefault (organization template), required (this event's form),
//   label (template + this event's copy), portalAccess, level (template: what parents see, basic / detailed),
//   calc (a calculated field's spec: template + every event copy, dependencies checked),
//   surface: { use, on } (where this event uses the field: lists, health, mail, email, documents, import),
//   contactRule (the participant contact e-mail, this event).
// Admins of a flagged organization only; every change is logged with before/after (FieldChangeLog).
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { calcDeps, readCalcSpec } from "@/lib/field-calc";
import { readContactRule } from "@/lib/contact-email";
import { fieldsManagerAccess, pickEvent } from "../access";

const SURFACES: Record<string, string[]> = { lists: ["list"], health: ["health_list", "health_detail"], mail: ["mail_list"], email: ["email"], documents: ["documents"], import: ["import"] };
const ACCESS = ["edit", "approval", "read", "hidden"];
const bad = (error = "invalid") => NextResponse.json({ error }, { status: 400 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const { key } = await params;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const { storage, requiredDefault, required, label, portalAccess, level, calc, surface, contactRule } = b;
  if (storage !== undefined && storage !== "profile" && storage !== "event") return bad("invalid_storage");
  if (requiredDefault !== undefined && typeof requiredDefault !== "boolean") return bad();
  if (required !== undefined && typeof required !== "boolean") return bad();
  if (label !== undefined && (typeof label !== "string" || !label.trim() || label.length > 120)) return bad();
  if (portalAccess !== undefined && !ACCESS.includes(portalAccess as string)) return bad();
  if (level !== undefined && level !== "basic" && level !== "detailed") return bad();
  const use = surface && typeof surface === "object" ? (surface as { use?: unknown; on?: unknown }) : null;
  if (surface !== undefined && (!use || typeof use.use !== "string" || !SURFACES[use.use] || typeof use.on !== "boolean")) return bad();

  const template = await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key } });
  const needsTemplate = storage !== undefined || requiredDefault !== undefined || portalAccess !== undefined || level !== undefined;
  if (needsTemplate && !template) return bad("no_template");
  const { selected } = await pickEvent(organizationId, req.nextUrl.searchParams.get("event"));
  const eventField = selected ? await prisma.eventParticipantField.findFirst({ where: { eventId: selected.id, key } }) : null;
  if ((required !== undefined || surface !== undefined || contactRule !== undefined) && !eventField) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (required !== undefined && eventField?.kind !== "custom") return bad();
  if (contactRule !== undefined && eventField?.computedType !== "contact_email") return bad();

  // A calculated field's spec: the same validation as creating one (phase 3b).
  let spec: ReturnType<typeof readCalcSpec> = null;
  if (calc !== undefined) {
    spec = readCalcSpec("calculated", calc);
    const isCalc = template?.fieldType === "calculated" || eventField?.fieldType === "calculated";
    if (!spec || !isCalc) return bad("invalid_calc");
    const known = new Set([
      ...(await prisma.participantFieldTemplate.findMany({ where: { organizationId }, select: { key: true } })).map((t) => t.key),
      ...(selected ? (await prisma.eventParticipantField.findMany({ where: { eventId: selected.id }, select: { key: true } })).map((f) => f.key) : []),
    ]);
    if (calcDeps(spec).some((d) => d === key || !known.has(d))) return bad("invalid_calc_dependency");
  }

  const before: Record<string, unknown> = { key, eventId: eventField?.eventId ?? null };
  const after: Record<string, unknown> = { key, eventId: eventField?.eventId ?? null };
  await prisma.$transaction(async (tx) => {
    if (template) {
      const data: Prisma.ParticipantFieldTemplateUpdateInput = {};
      if (storage !== undefined) data.storage = storage as never;
      if (requiredDefault !== undefined) data.requiredInRegistration = requiredDefault as boolean;
      if (label !== undefined) data.label = (label as string).trim();
      if (portalAccess !== undefined) data.portalAccess = portalAccess as never;
      if (level !== undefined) data.level = level as never;
      if (spec) data.options = spec as unknown as Prisma.InputJsonValue;
      if (Object.keys(data).length) {
        for (const k of Object.keys(data)) before[k] = (template as Record<string, unknown>)[k === "requiredInRegistration" ? "requiredInRegistration" : k];
        Object.assign(after, data);
        await tx.participantFieldTemplate.update({ where: { id: template.id }, data });
      }
    }
    if (spec) await tx.eventParticipantField.updateMany({ where: { key, fieldType: "calculated", event: { organizationId } }, data: { options: spec as unknown as Prisma.InputJsonValue } });
    if (eventField) {
      const data: Prisma.EventParticipantFieldUpdateInput = {};
      if (required !== undefined) data.requiredOnRegistration = required as boolean;
      if (label !== undefined) data.label = (label as string).trim();
      if (use) {
        const now = new Set<string>(eventField.surfaces);
        for (const s of SURFACES[use.use as string]) (use.on ? now.add(s) : now.delete(s));
        data.surfaces = [...now] as never;
        before.surfaces = eventField.surfaces;
      }
      if (contactRule !== undefined) {
        data.options = { ...((eventField.options as object | null) ?? {}), contactRule: readContactRule(contactRule) } as Prisma.InputJsonValue;
        before.options = eventField.options;
      }
      if (Object.keys(data).length) {
        Object.assign(after, data);
        await tx.eventParticipantField.update({ where: { id: eventField.id }, data });
      }
    }
    await tx.fieldChangeLog.create({ data: { organizationId, action: "edit", byId: userId, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)) } });
  });
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
