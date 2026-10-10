import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ACTING_ORG_COOKIE, requireSuperAdmin } from "@/lib/org-scope";

// Super-admin's organization switch (organizations step 3): { organizationId } sets the
// acting organization, null (or the home organization) clears it. Only active organizations.
// The cookie is host-only (no Domain), so it never reaches the public hosts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const { organizationId } = await req.json().catch(() => ({}));

  const res = NextResponse.json({ ok: true });
  if (!organizationId || organizationId === user.organizationId) {
    res.cookies.delete(ACTING_ORG_COOKIE);
    return res;
  }
  if (typeof organizationId !== "string" || !(await prisma.organization.findFirst({ where: { id: organizationId, active: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  res.cookies.set(ACTING_ORG_COOKIE, organizationId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return res;
}
