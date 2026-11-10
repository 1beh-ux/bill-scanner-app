import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma";

initAdmin();

export const ACTING_ORG_COOKIE = "acting_org";
// "Zobrazit jako" (2026-11-10): "<organizationId>:<userId>", set by POST /api/impersonate. Read-only:
// src/proxy.ts refuses every non-GET API call while it is set.
export const IMPERSONATE_COOKIE = "impersonate";

type RoleUser = { id: string; isSuperAdmin: boolean; role: UserRole; organizationId: string };

/** Their role in an organization (own or member), null if not in it or it's inactive. */
async function roleIn(user: { id: string; role: UserRole; organizationId: string }, organizationId: string): Promise<UserRole | null> {
  if (user.organizationId === organizationId) return user.role;
  const m = await prisma.organizationMembership.findFirst({ where: { userId: user.id, organizationId, organization: { active: true } }, select: { role: true } });
  return m?.role ?? null;
}

/**
 * Who `real` may view the app as, in `organizationId`: super-admin -> anyone there except another
 * super-admin; an admin of that organization -> its non-admin users and members. Else null.
 */
export async function impersonationTarget(real: RoleUser, organizationId: string, targetId: string) {
  if (targetId === real.id) return null;
  if (!real.isSuperAdmin && (await roleIn(real, organizationId)) !== "admin") return null;
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.active || target.isSuperAdmin) return null;
  const role = await roleIn(target, organizationId);
  if (!role || (role === "admin" && !real.isSuperAdmin)) return null;
  const org = await prisma.organization.findFirst({ where: { id: organizationId, active: true }, select: { id: true } });
  return org ? { target, role } : null;
}

export async function actingIn(user: { id: string; isSuperAdmin: boolean; role: UserRole }, organizationId: string): Promise<{ organizationId: string; role: UserRole } | null> {
  if (user.isSuperAdmin) {
    const org = await prisma.organization.findFirst({ where: { id: organizationId, active: true }, select: { id: true } });
    return org ? { organizationId, role: user.role } : null;
  }
  const m = await prisma.organizationMembership.findFirst({ where: { userId: user.id, organizationId, organization: { active: true } }, select: { role: true } });
  return m ? { organizationId, role: m.role } : null;
}

type Impersonator = { id: string; displayName: string; email: string };

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
    // Viewing as someone else: THEIR identity, role and module grants in that organization; who is
    // really behind it rides along as impersonatedBy (the strip, /api/me). Checked on every request.
    const imp = cookieStore.get(IMPERSONATE_COOKIE)?.value?.split(":");
    if (imp?.length === 2) {
      const found = await impersonationTarget(user, imp[0], imp[1]);
      if (found) {
        return {
          ...found.target,
          homeOrganizationId: found.target.organizationId,
          organizationId: imp[0],
          role: found.role,
          impersonatedBy: { id: user.id, displayName: user.displayName, email: user.email } as Impersonator | null,
        };
      }
    }
    const wanted = cookieStore.get(ACTING_ORG_COOKIE)?.value;
    const acting = wanted && wanted !== user.organizationId ? await actingIn(user, wanted) : null;
    return { ...plain, homeOrganizationId: user.organizationId, ...(acting ?? {}), impersonatedBy: null as Impersonator | null };
  } catch {
    return null;
  }
}
