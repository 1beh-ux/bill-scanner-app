import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfUser } from "@/lib/org-owner";
import { getActingOrgId, isOrgAdmin, requireSuperAdmin } from "@/lib/org-scope";
import { usersOfOrg } from "@/lib/org-members";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // The acting organization's users + members from other organizations (role in this one).
  const users = await usersOfOrg(await getActingOrgId(user));
  return NextResponse.json(users.map((u) => ({ ...u, self: u.id === user.id })));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, displayName, role } = body;
  if (!email || !displayName || !role) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (role !== "admin" && role !== "accountant" && role !== "user") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  // Only a super-admin makes someone an admin (organizations step 3).
  if (role === "admin") {
    const notSuperAdmin = requireSuperAdmin(user);
    if (notSuperAdmin) return notSuperAdmin;
  }

  const organizationId = await orgIdOfUser(user);
  const normalized = email.trim().toLowerCase();
  // Already a user of another organization: added here as a member (one person, several
  // organizations) by any admin of this one -- their own account, name and home stay as they are.
  // Already here (own or member): duplicate_email.
  const existing = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, organizationId: true, memberships: { where: { organizationId }, select: { role: true } } } });
  if (existing && existing.organizationId !== organizationId && existing.memberships.length === 0) {
    await prisma.organizationMembership.create({ data: { userId: existing.id, organizationId, role } });
    return NextResponse.json((await usersOfOrg(organizationId, { id: existing.id }))[0], { status: 201 });
  }
  if (existing) return NextResponse.json({ error: "duplicate_email" }, { status: 409 });

  try {
    const created = await prisma.user.create({
      data: { email: normalized, displayName: displayName.trim(), role, organizationId },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_email" }, { status: 409 });
    }
    throw err;
  }
}