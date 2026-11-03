import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";
import { parseRateSet } from "@/lib/travel-rates-server";

// One rate set (organization admins). Submitted orders keep their own copy of the values, so editing or
// deleting a set never changes them.
async function own(id: string): Promise<{ error: NextResponse } | { ok: true }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  const found = await prisma.travelRateSet.count({ where: { id, organizationId: await getActingOrgId(user) } });
  return found ? { ok: true as const } : { error: notFound() };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await own(id);
  if ("error" in a) return a.error;
  const parsed = parseRateSet((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("bad" in parsed) return NextResponse.json({ error: "bad_request", bad: parsed.bad }, { status: 400 });
  try {
    return NextResponse.json(await prisma.travelRateSet.update({ where: { id }, data: parsed.data }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "valid_from_taken" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await own(id);
  if ("error" in a) return a.error;
  await prisma.travelRateSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
