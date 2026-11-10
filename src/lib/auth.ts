import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma";

initAdmin();

export const ACTING_ORG_COOKIE = "acting_org";

export async function actingIn(user: { id: string; isSuperAdmin: boolean; role: UserRole }, organizationId: string): Promise<{ organizationId: string; role: UserRole } | null> {
  if (user.isSuperAdmin) {
    const org = await prisma.organization.findFirst({ where: { id: organizationId, active: true }, select: { id: true } });
    return org ? { organizationId, role: user.role } : null;
  }
  const m = await prisma.organizationMembership.findFirst({ where: { userId: user.id, organizationId, organization: { active: true } }, select: { role: true } });
  return m ? { organizationId, role: m.role } : null;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return null;

  try {
    const decoded = await getAuth().verifySessionCookie(session, true);
    if (!decoded.email) return null;

    const user = await prisma.user.findUnique({ where: { email: decoded.email }, include: { organization: { select: { active: true } } } });
    // A deactivated organization's users are treated like inactive users.
    if (!user || !user.active || !user.organization.active) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organization, ...plain } = user;
    // The acting organization (the acting_org cookie, POST /api/acting-org): a super-admin's pick of any
    // active one, or another organization this person is a member of -- with their role THERE. Everything
    // downstream (org-scope, isOrgAdmin, /api/me) reads organizationId + role, so it acts in that org.
    // homeOrganizationId stays their own.
    const wanted = cookieStore.get(ACTING_ORG_COOKIE)?.value;
    const acting = wanted && wanted !== user.organizationId ? await actingIn(user, wanted) : null;
    return { ...plain, homeOrganizationId: user.organizationId, ...(acting ?? {}) };
  } catch {
    return null;
  }
}
