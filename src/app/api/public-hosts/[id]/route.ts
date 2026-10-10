import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound, requireSuperAdmin } from "@/lib/org-scope";
import { checkHostInput, hostOrganization } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Edit or (de)activate one public host of any organization (super-admin, Aplikace ->
// Veřejné adresy); the body is the whole row (as in POST), organizationId may move it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const { id } = await params;
  const current = await prisma.publicHost.findUnique({ where: { id }, select: { organizationId: true } });
  if (!current) return notFound();
  const body = await req.json().catch(() => null);
  const organizationId = await hostOrganization(body, current.organizationId);
  if (!organizationId) return NextResponse.json({ error: "bad_organization" }, { status: 400 });
  // checkHostInput keeps an event-tied host inside that organization (bad_event otherwise).
  const checked = await checkHostInput(body, id, organizationId);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.update({ where: { id }, data: { ...checked.data, organizationId } });
  invalidatePublicHosts();
  return NextResponse.json(host);
}
