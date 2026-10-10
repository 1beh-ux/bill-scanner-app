import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, requireSuperAdmin } from "@/lib/org-scope";
import { checkHostInput, hostOrganization } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Public addresses (docs/custom-domain.md). Default: the acting organization's,
// read by its admins (Organizace -> Připojení). ?all=1: every organization's
// (Aplikace -> Veřejné adresy, super-admin), with events and organizations for the form.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (all) {
    const notSuperAdmin = requireSuperAdmin(user);
    if (notSuperAdmin) return notSuperAdmin;
  }
  const scope = all ? {} : { organizationId: await getActingOrgId(user) };
  const [hosts, events, organizations] = await Promise.all([
    prisma.publicHost.findMany({
      where: scope,
      orderBy: [{ active: "desc" }, { hostname: "asc" }],
      include: { event: { select: { name: true } }, organization: { select: { shortName: true } } },
    }),
    prisma.event.findMany({ where: { ...scope, status: "active" }, orderBy: { startDate: "desc" }, select: { id: true, name: true, organizationId: true } }),
    all ? prisma.organization.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, shortName: true } }) : [],
  ]);
  return NextResponse.json({ hosts, events, organizations, lbIpSet: !!process.env.LB_IP, canEdit: user.isSuperAdmin });
}

/** Super-admin: { ...host, organizationId? } -- the organization defaults to the acting one. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const body = await req.json().catch(() => null);
  const organizationId = await hostOrganization(body, await getActingOrgId(user));
  if (!organizationId) return NextResponse.json({ error: "bad_organization" }, { status: 400 });
  const checked = await checkHostInput(body, null, organizationId);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.create({ data: { ...checked.data, createdByUserId: user.id, organizationId } });
  invalidatePublicHosts();
  return NextResponse.json(host, { status: 201 });
}

