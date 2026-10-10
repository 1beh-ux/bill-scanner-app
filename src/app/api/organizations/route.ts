import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";

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
      _count: { select: { users: true, events: true, publicHosts: true } },
    },
  });
  return NextResponse.json({
    homeOrganizationId: user.organizationId,
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      shortName: o.shortName,
      contactEmail: o.contactEmail,
      active: o.active,
      admins: o.users.map((u) => u.email),
      users: o._count.users,
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
  // An e-mail is one account in one organization (users.email is unique app-wide).
  const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { organization: { select: { name: true } } } });
  if (existing) return NextResponse.json({ error: "email_taken", organization: existing.organization.name }, { status: 409 });

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name, shortName, contactEmail } });
    await tx.user.create({ data: { email: adminEmail, displayName: adminName, role: "admin", organizationId: created.id } });
    return created;
  });
  return NextResponse.json(org, { status: 201 });
}
