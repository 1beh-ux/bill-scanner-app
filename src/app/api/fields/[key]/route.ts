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
import { lockBlocker, setLocked, SYSTEM_KEYS } from "@/lib/org-locked";
import { fieldsManagerAccess, orgSectionKeys, pickEvent } from "../access";
import { propagateOrgRequired } from "@/lib/form-structure";

const SURFACES: Record<string, string[]> = { lists: ["list"], health: ["health_list", "health_detail"], mail: ["mail_list"], email: ["email"], documents: ["documents"], import: ["import"] };
const ACCESS = ["edit", "approval", "read", "hidden"];
const PLAIN_TYPES = ["text", "longtext", "number", "date", "boolean", "select", "multi", "consent", "email", "phone"];
const bad = (error = "invalid") => NextResponse.json({ error }, { status: 400 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const { key } = await params;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  // 2026-11-24: use the organization field in this event (a copy from the template) / stop using it (switched off,
  // values kept). System and organization-fixed fields can't be dropped.
  if (b.inEvent !== undefined) {
    if (typeof b.inEvent !== "boolean") return bad();
    const { selected: ev } = await pickEvent(organizationId, req.nextUrl.searchParams.get("event"));
    const tpl = await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key } });
    if (!ev || !tpl) return bad("no_template");
    const copy = await prisma.eventParticipantField.findFirst({ where: { eventId: ev.id, key } });
    if (!b.inEvent) {
      const blocked = await lockBlocker(organizationId, true, key, { active: false });
      if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
      if (copy) await prisma.eventParticipantField.update({ where: { id: copy.id }, data: { active: false } });
    } else if (copy) await prisma.eventParticipantField.update({ where: { id: copy.id }, data: { active: true } });
    else
      await prisma.eventParticipantField.create({
        data: { eventId: ev.id, key, label: tpl.label, fieldType: tpl.fieldType, options: (tpl.options ?? undefined) as Prisma.InputJsonValue | undefined, surfaces: tpl.defaultSurfaces, isFromTemplate: true, requiredOnRegistration: tpl.requiredInRegistration },
      });
    await prisma.fieldChangeLog.create({ data: { organizationId, action: "edit", byId: userId, before: { key, eventId: ev.id, inEvent: !!copy?.active }, after: { key, eventId: ev.id, inEvent: b.inEvent } } });
    invalidateResolverContext(ev.id);
    return NextResponse.json({ ok: true });
  }
  // Round 2: lock / unlock the field for the whole organization ("Pevné pole organizace").
  if (b.locked !== undefined) {
    if (typeof b.locked !== "boolean" || SYSTEM_KEYS.has(key)) return bad();
    try {
      const r = await setLocked(organizationId, key, b.locked, userId);
      invalidateResolverContext();
      return NextResponse.json({ ok: true, ...r });
    } catch (err) {
      return bad(err instanceof Error && err.message === "no_template" ? "no_template" : "invalid");
    }
  }
  const { storage, requiredDefault, required, label, portalAccess, level, calc, surface, contactRule, choices, fieldType, profileSection } = b;
  // 2026-11-24: editing an existing field -- its choices (select / multi) and its type (plain types only; making a
  // field calculated goes through Úklid, which keeps the values). An organization field changes everywhere it is
  // used (template + its event copies), an event-only field in this event.
  if (fieldType !== undefined && !PLAIN_TYPES.includes(fieldType as string)) return bad("invalid_type");
  const list = Array.isArray(choices) ? [...new Set(choices.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean))].slice(0, 100) : null;
  if (choices !== undefined && !list?.length) return bad("options_required");
  if (storage !== undefined && storage !== "profile" && storage !== "event") return bad("invalid_storage");
  if (requiredDefault !== undefined && typeof requiredDefault !== "boolean") return bad();
  if (required !== undefined && typeof required !== "boolean") return bad();
  if (label !== undefined && (typeof label !== "string" || !label.trim() || label.length > 120)) return bad();
  if (portalAccess !== undefined && !ACCESS.includes(portalAccess as string)) return bad();
  if (level !== undefined && level !== "basic" && level !== "detailed") return bad();
  // Portal profile section: one of the organization's sections, or null (= by level).
  if (profileSection !== undefined && profileSection !== null && !(await orgSectionKeys(organizationId)).has(profileSection as string)) return bad();
  const use = surface && typeof surface === "object" ? (surface as { use?: unknown; on?: unknown }) : null;
  if (surface !== undefined && (!use || typeof use.use !== "string" || !SURFACES[use.use] || typeof use.on !== "boolean")) return bad();

  const template = await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key } });
  const needsTemplate = storage !== undefined || requiredDefault !== undefined || portalAccess !== undefined || level !== undefined || profileSection !== undefined;
  if (needsTemplate && !template) return bad("no_template");
  const { selected } = await pickEvent(organizationId, req.nextUrl.searchParams.get("event"));
  const eventField = selected ? await prisma.eventParticipantField.findFirst({ where: { eventId: selected.id, key } }) : null;
  if ((required !== undefined || surface !== undefined || contactRule !== undefined) && !eventField) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (required !== undefined && eventField?.kind !== "custom") return bad();
  if (contactRule !== undefined && eventField?.computedType !== "contact_email") return bad();
  if ((choices !== undefined || fieldType !== undefined) && (eventField ? eventField.kind !== "custom" : !template)) return bad("fixed_field");
  const typeAfter = (fieldType as string | undefined) ?? template?.fieldType ?? eventField?.fieldType ?? "";
  if ((fieldType !== undefined || choices !== undefined) && ["calculated", "composite", "image"].includes(template?.fieldType ?? eventField?.fieldType ?? "")) return bad("invalid_type");
  if ((typeAfter === "select" || typeAfter === "multi") && fieldType !== undefined && !list && !Array.isArray(template?.options ?? eventField?.options)) return bad("options_required");
  const plainData = { ...(fieldType !== undefined && { fieldType: fieldType as never }), ...(list && { options: list as Prisma.InputJsonValue }) };

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
      if (profileSection !== undefined) data.profileSection = profileSection as string | null;
      if (spec) data.options = spec as unknown as Prisma.InputJsonValue;
      Object.assign(data, plainData);
      if (Object.keys(data).length) {
        for (const k of Object.keys(data)) before[k] = (template as Record<string, unknown>)[k === "requiredInRegistration" ? "requiredInRegistration" : k];
        Object.assign(after, data);
        await tx.participantFieldTemplate.update({ where: { id: template.id }, data });
      }
    }
    if (spec) await tx.eventParticipantField.updateMany({ where: { key, fieldType: "calculated", event: { organizationId } }, data: { options: spec as unknown as Prisma.InputJsonValue } });
    // Choices / type: every event copy of an organization field, else this event's own field.
    if (Object.keys(plainData).length) {
      if (template) await tx.eventParticipantField.updateMany({ where: { key, kind: "custom", event: { organizationId } }, data: plainData });
      else if (eventField) await tx.eventParticipantField.update({ where: { id: eventField.id }, data: plainData });
      before.fieldType = template?.fieldType ?? eventField?.fieldType;
      before.options = template?.options ?? eventField?.options;
      Object.assign(after, plainData);
    }
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
  // A changed organization default reaches the events that still had the old one (Formulář, 2026-11-26).
  if (template && requiredDefault !== undefined) await propagateOrgRequired(organizationId, key, template.requiredInRegistration, requiredDefault as boolean);
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
