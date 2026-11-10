import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, IMPERSONATE_COOKIE, impersonationTarget } from "@/lib/auth";

// "Zobrazit jako": view the app as one person, read-only (src/proxy.ts blocks writes while the cookie
// is set; getCurrentUser re-checks the right on every request). { userId, organizationId? } --
// organizationId defaults to the organization the admin acts in (a super-admin may name any).
export async function POST(req: NextRequest) {
  if ((await cookies()).get(IMPERSONATE_COOKIE)) return NextResponse.json({ error: "already_impersonating" }, { status: 409 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { userId, organizationId } = await req.json().catch(() => ({}));
  const orgId = user.isSuperAdmin && typeof organizationId === "string" ? organizationId : user.organizationId;
  // user = the acting view (organizationId + role there): exactly "admin of the organization they act in".
  if (typeof userId !== "string" || !(await impersonationTarget(user, orgId, userId))) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  console.log(`impersonate: ${user.email} -> ${userId} in ${orgId}`);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, `${orgId}:${userId}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(IMPERSONATE_COOKIE);
  return res;
}
