// Redesign R8/R10: an event-level variable changed right in the Fields Manager panel -- the same event column the
// event settings edit. Values that belong to a bigger setting with its own rules (sender mailbox, bank account,
// organization name) are not changed here; the panel links to their place instead.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess, pickEvent } from "../access";

const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);
const COLUMNS: Record<string, { column: string; parse: (v: string) => unknown; nullable: boolean }> = {
  camp_name: { column: "name", parse: (v) => v.trim().slice(0, 200) || undefined, nullable: false },
  date_from: { column: "startDate", parse: day, nullable: false },
  date_to: { column: "endDate", parse: day, nullable: true },
  place: { column: "location", parse: (v) => v.trim().slice(0, 300), nullable: true },
  price_member: { column: "memberPriceCzk", parse: (v) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : undefined), nullable: true },
  price_nonmember: { column: "nonMemberPriceCzk", parse: (v) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : undefined), nullable: true },
  contact_email: { column: "publicContactEmail", parse: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? v.trim() : undefined), nullable: true },
  registration_deadline: { column: "registrationDeadline", parse: day, nullable: true },
  questionnaire_url: { column: "mailQuestionnaireUrl", parse: (v) => (/^https?:\/\/\S+$/.test(v.trim()) ? v.trim() : undefined), nullable: true },
};


export async function PATCH(req: NextRequest) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { event?: unknown; key?: unknown; value?: unknown };
  const { selected } = await pickEvent(a.organizationId, typeof b.event === "string" ? b.event : null);
  if (!selected || selected.id !== b.event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const c = typeof b.key === "string" ? COLUMNS[b.key] : undefined;
  if (!c || typeof b.value !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const value = b.value.trim() === "" ? (c.nullable ? null : undefined) : c.parse(b.value);
  if (value === undefined) return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  const before = await prisma.event.findUniqueOrThrow({ where: { id: selected.id }, select: { [c.column]: true } as never });
  await prisma.$transaction([
    prisma.event.update({ where: { id: selected.id }, data: { [c.column]: value } as never }),
    prisma.fieldChangeLog.create({ data: { organizationId: a.organizationId, action: "event_value", byId: a.userId, before: JSON.parse(JSON.stringify({ eventId: selected.id, key: b.key, ...before })), after: JSON.parse(JSON.stringify({ eventId: selected.id, key: b.key, [c.column]: value })) } }),
  ]);
  invalidateResolverContext(selected.id);
  return NextResponse.json({ ok: true });
}
