import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, requireSuperAdmin } from "@/lib/org-scope";
import { checkHostInput } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Organizace -> Připojení -> Veřejné adresy (docs/custom-domain.md). The acting
// organization's hosts: organization admins read them, only a super-admin adds/edits.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const organizationId = await getActingOrgId(user);
  const [hosts, events] = await Promise.all([
    prisma.publicHost.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { hostname: "asc" }], include: { event: { select: { name: true } } } }),
    prisma.event.findMany({ where: { organizationId, status: "active" }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ hosts, events, lbIpSet: !!process.env.LB_IP, canEdit: user.isSuperAdmin });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const organizationId = await getActingOrgId(user);
  const checked = await checkHostInput(await req.json().catch(() => null), null, organizationId);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.create({ data: { ...checked.data, createdByUserId: user.id, organizationId } });
  invalidatePublicHosts();
  return NextResponse.json(host, { status: 201 });
}
