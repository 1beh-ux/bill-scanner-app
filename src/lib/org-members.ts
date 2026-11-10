// People of an organization: its own users + members from other organizations
// (OrganizationMembership), each with their role IN that organization.
import type { Prisma, User, UserRole } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export const inOrg = (organizationId: string): Prisma.UserWhereInput => ({ OR: [{ organizationId }, { memberships: { some: { organizationId } } }] });

export type OrgUser = User & { homeOrganizationId: string; member: boolean };

/** member = true: their own organization is another one (role/removal go through the membership). */
export async function usersOfOrg(organizationId: string, where: Prisma.UserWhereInput = {}): Promise<OrgUser[]> {
  const users = await prisma.user.findMany({
    where: { AND: [where, inOrg(organizationId)] },
    include: { memberships: { where: { organizationId }, select: { role: true } } },
    orderBy: { displayName: "asc" },
  });
  return users.map(({ memberships, ...u }) => {
    const member = u.organizationId !== organizationId;
    return { ...u, role: member ? (memberships[0]?.role as UserRole) : u.role, homeOrganizationId: u.organizationId, organizationId, member };
  });
}

export const activeAdminCount = async (organizationId: string) =>
  (await usersOfOrg(organizationId, { active: true })).filter((u) => u.role === "admin").length;
