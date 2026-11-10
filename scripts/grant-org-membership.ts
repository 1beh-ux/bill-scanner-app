// Adds an existing user to another organization with a role (one person, several organizations).
// npx tsx scripts/grant-org-membership.ts <email> <organization name> <admin|accountant|user>
import { prisma } from "../src/lib/prisma";
import type { UserRole } from "../src/generated/prisma";

(async () => {
  const [email, orgName, role] = process.argv.slice(2);
  if (!email || !orgName || !["admin", "accountant", "user"].includes(role)) throw new Error("usage: <email> <organization name> <admin|accountant|user>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  if (user.organizationId === org.id) throw new Error(`${email} already belongs to ${orgName} (their own organization)`);
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role: role as UserRole },
    update: { role: role as UserRole },
  });
  console.log(`${email} -> ${org.name} as ${role}`);
  await prisma.$disconnect();
})();
