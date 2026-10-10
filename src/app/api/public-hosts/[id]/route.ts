import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, notFound, requireSuperAdmin } from "@/lib/org-scope";
import { checkHostInput } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Edit or (de)activate one public host of the acting organization (super-admin); the body is the whole row (as in POST).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const { id } = await params;
  const organizationId = await getActingOrgId(user);
  if (!(await prisma.publicHost.findFirst({ where: { id, organizationId }, select: { id: true } }))) return notFound();
  const checked = await checkHostInput(await req.json().catch(() => null), id, organizationId);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.update({ where: { id }, data: checked.data });
  invalidatePublicHosts();
  return NextResponse.json(host);
}
