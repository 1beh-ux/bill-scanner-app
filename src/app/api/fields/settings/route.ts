// PATCH /api/fields/settings -- organization-wide Fields Manager settings (phase 3a): guardian slots (1..6).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_GUARDIAN_SLOTS } from "@/lib/org-features";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess } from "../access";

export async function PATCH(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId, userId } = access;
  const slots = (await req.json().catch(() => null))?.guardianSlots;
  if (!Number.isInteger(slots) || slots < 1 || slots > MAX_GUARDIAN_SLOTS) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { guardianSlots: true } });
  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { guardianSlots: slots } }),
    prisma.fieldChangeLog.create({ data: { organizationId, action: "guardians", byId: userId, before: { guardianSlots: org.guardianSlots }, after: { guardianSlots: slots } } }),
  ]);
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
