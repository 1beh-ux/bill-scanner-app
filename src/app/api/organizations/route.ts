import { ensureDefaultTravelRates } from "@/lib/travel-rates-defaults";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";
import { copyAppTemplatesToOrganization } from "@/lib/app-templates";

// Aplikace -> Organizace (super-admin only, organizations step 3).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { where: { role: "admin", active: true }, select: { email: true }, orderBy: { email: "asc" } },
      memberships: { where: { role: "admin", user: { active: true } }, select: { user: { select: { email: true } } } },
      _count: { select: { users: true, memberships: true, events: true, publicHosts: true } },
    },
  });
  return NextResponse.json({
    homeOrganizationId: user.homeOrganizationId,
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      shortName: o.shortName,
      contactEmail: o.contactEmail,
      active: o.active,
      admins: [...o.users.map((u) => u.email), ...o.memberships.map((m) => m.user.email)],
      users: o._count.users + o._count.memberships,
      events: o._count.events,
      publicHosts: o._count.publicHosts,
    })),
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** { name, shortName, contactEmail?, adminEmail, adminName }: the organization + its first admin, together. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const body = await req.json().catch(() => ({}));
  const name = text(body.name, 120);
  const shortName = text(body.shortName, 40);
  const contactEmail = text(body.contactEmail, 200).toLowerCase() || null;
  const adminEmail = text(body.adminEmail, 200).toLowerCase();
  const adminName = text(body.adminName, 120);
  if (!name || !shortName || !adminName) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (!EMAIL.test(adminEmail) || (contactEmail && !EMAIL.test(contactEmail))) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  // An existing account (users.email is unique app-wide) becomes the first admin as a member;
  // its own organization and name stay as they are.
  const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name, shortName, contactEmail } });
    if (existing) await tx.organizationMembership.create({ data: { userId: existing.id, organizationId: created.id, role: "admin" } });
    else await tx.user.create({ data: { email: adminEmail, displayName: adminName, role: "admin", organizationId: created.id } });
    // It starts with copies of every active app template (Aplikace -> Šablony aplikace).
    await copyAppTemplatesToOrganization(tx, created.id);
    // And the default travel-order rate sets (Organizace -> Sazby cestovních náhrad).
    await ensureDefaultTravelRates(tx, created.id);
    return created;
  }, { timeout: 60_000 });
  return NextResponse.json(org, { status: 201 });
}
