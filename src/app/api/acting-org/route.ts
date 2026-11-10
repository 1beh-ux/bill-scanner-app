import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ACTING_ORG_COOKIE } from "@/lib/org-scope";

// Organization switch (organizations step 3): { organizationId } sets the acting organization,
// null (or the home organization) clears it. Super-admin: any active organization; anyone else:
// one they are a member of (OrganizationMembership). getCurrentUser checks it again on every request.
// The cookie is host-only (no Domain), so it never reaches the public hosts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { organizationId } = await req.json().catch(() => ({}));

  const res = NextResponse.json({ ok: true });
  if (!organizationId || organizationId === user.homeOrganizationId) {
    res.cookies.delete(ACTING_ORG_COOKIE);
    return res;
  }
  if (typeof organizationId !== "string" || !(await prisma.organization.findFirst({ where: { id: organizationId, active: true, ...(!user.isSuperAdmin && { memberships: { some: { userId: user.id } } }) }, select: { id: true } }))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  res.cookies.set(ACTING_ORG_COOKIE, organizationId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return res;
}
