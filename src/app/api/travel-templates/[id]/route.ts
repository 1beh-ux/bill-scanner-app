import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";

// DELETE a trip template: an organization admin, or whoever saved it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const t = await prisma.travelTemplate.findFirst({ where: { id, organizationId: await getActingOrgId(user) }, select: { createdByUserId: true } });
  if (!t) return notFound();
  if (!isOrgAdmin(user) && t.createdByUserId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.travelTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
