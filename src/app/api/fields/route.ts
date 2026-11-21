// POST /api/fields {event, label, key, fieldType, options} -- a new field (Fields Manager phase 3b): the organization
// template + its copy in the selected event. Calculated fields: fieldType "calculated", options = CalcSpec (field-calc.ts).
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { calcDeps, readCalcSpec } from "@/lib/field-calc";
import { FIELD_KEY, renameBlocker } from "@/lib/field-rename";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess, pickEvent } from "./access";

const TYPES = ["text", "longtext", "number", "date", "boolean", "select", "multi", "consent", "email", "phone", "calculated"] as const;
type NewType = (typeof TYPES)[number];

export async function POST(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const b = ((await req.json().catch(() => null)) ?? {}) as { event?: unknown; label?: unknown; key?: unknown; fieldType?: unknown; options?: unknown };
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 200) : "";
  const key = typeof b.key === "string" ? b.key.trim() : "";
  const fieldType = (TYPES as readonly unknown[]).includes(b.fieldType) ? (b.fieldType as NewType) : null;
  if (!label || !fieldType) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!FIELD_KEY.test(key)) return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  if (await renameBlocker(prisma, organizationId, "", key)) return NextResponse.json({ error: "key_taken" }, { status: 409 });
  const { selected } = await pickEvent(organizationId, typeof b.event === "string" ? b.event : null);

  let options: unknown = undefined;
  if (fieldType === "select" || fieldType === "multi") {
    const list = Array.isArray(b.options) ? [...new Set(b.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean))].slice(0, 100) : [];
    if (!list.length) return NextResponse.json({ error: "options_required" }, { status: 400 });
    options = list;
  } else if (fieldType === "calculated") {
    const spec = readCalcSpec("calculated", b.options);
    if (!spec) return NextResponse.json({ error: "invalid_calc" }, { status: 400 });
    // Dependencies must exist (a field of the organization or the selected event); no self-reference.
    const known = new Set([
      ...(await prisma.participantFieldTemplate.findMany({ where: { organizationId }, select: { key: true } })).map((t) => t.key),
      ...(selected ? (await prisma.eventParticipantField.findMany({ where: { eventId: selected.id }, select: { key: true } })).map((f) => f.key) : []),
      "participant_name",
    ]);
    if (calcDeps(spec).some((d) => d === key || !known.has(d))) return NextResponse.json({ error: "invalid_calc_dependency" }, { status: 400 });
    options = spec;
  }
  const surfaces = fieldType === "calculated" ? ["list", "documents", "email"] : ["list", "documents", "email", "import"];

  await prisma.$transaction([
    prisma.participantFieldTemplate.create({ data: { organizationId, key, label, fieldType, options: options as Prisma.InputJsonValue, defaultSurfaces: surfaces as Prisma.ParticipantFieldTemplateCreateInput["defaultSurfaces"], portalAccess: "hidden" } }),
    ...(selected ? [prisma.eventParticipantField.create({ data: { eventId: selected.id, key, label, fieldType, options: options as Prisma.InputJsonValue, surfaces: surfaces as Prisma.EventParticipantFieldCreateInput["surfaces"], isFromTemplate: true } })] : []),
    prisma.fieldChangeLog.create({ data: { organizationId, action: "create", byId: userId, after: { key, label, fieldType, options: options as Prisma.InputJsonValue, eventId: selected?.id ?? null } } }),
  ]);
  invalidateResolverContext();
  return NextResponse.json({ ok: true, key }, { status: 201 });
}
