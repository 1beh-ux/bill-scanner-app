// Self-check for one person in several organizations (OrganizationMembership): which organization a
// user may act in and with what role, and who an organization's user list contains.
// Needs a THROWAWAY database (it creates and deletes rows): DATABASE_URL=... npx tsx scripts/check-org-memberships.ts
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { actingIn, impersonationTarget } from "../src/lib/auth";
import { activeAdminCount, usersOfOrg } from "../src/lib/org-members";

(async () => {
  const tag = `chk-${Date.now()}`;
  const [a, b, c] = await Promise.all(["A", "B", "C"].map((n) => prisma.organization.create({ data: { name: `${tag} ${n}`, shortName: n } })));
  const pavel = await prisma.user.create({ data: { email: `${tag}-pavel@x.cz`, displayName: "Pavel", role: "user", organizationId: a.id } });
  const alias = await prisma.user.create({ data: { email: `${tag}-ja@x.cz`, displayName: "Ja", role: "admin", organizationId: b.id } });
  const sa = await prisma.user.create({ data: { email: `${tag}-sa@x.cz`, displayName: "SA", role: "admin", isSuperAdmin: true, organizationId: a.id } });
  await prisma.organizationMembership.create({ data: { userId: pavel.id, organizationId: b.id, role: "admin" } });
  try {
    // Member: B with the membership's role; not C; not a deactivated B.
    assert.deepEqual(await actingIn(pavel, b.id), { organizationId: b.id, role: "admin" });
    assert.equal(await actingIn(pavel, c.id), null);
    // Super-admin: any active organization, own role.
    assert.deepEqual(await actingIn(sa, c.id), { organizationId: c.id, role: "admin" });

    // B's list: its own admin + the member (as admin there); A's list: Pavel as a plain user, not a member.
    const inB = await usersOfOrg(b.id);
    assert.deepEqual(inB.map((u) => [u.email, u.role, u.member]).sort(), [[alias.email, "admin", false], [pavel.email, "admin", true]].sort());
    assert.ok(inB.every((u) => u.organizationId === b.id));
    const pavelInA = (await usersOfOrg(a.id)).find((u) => u.id === pavel.id)!;
    assert.deepEqual([pavelInA.role, pavelInA.member], ["user", false]);
    assert.equal(await activeAdminCount(b.id), 2);
    assert.equal((await usersOfOrg(c.id)).length, 0);

    // "Zobrazit jako": B's admin (alias) -> B's non-admins only; never themselves, an admin or a super-admin.
    const helper = await prisma.user.create({ data: { email: `${tag}-helper@x.cz`, displayName: "Helper", role: "user", organizationId: b.id } });
    const may = async (who: Parameters<typeof impersonationTarget>[0], org: string, target: string) => (await impersonationTarget(who, org, target))?.role ?? null;
    assert.equal(await may(alias, b.id, helper.id), "user");
    assert.equal(await may(alias, b.id, pavel.id), null, "pavel is admin in B");
    assert.equal(await may(alias, b.id, alias.id), null, "not oneself");
    assert.equal(await may(alias, a.id, pavel.id), null, "alias is not in A");
    assert.equal(await may(alias, b.id, sa.id), null, "never a super-admin");
    // Pavel: admin of B as a member -> B's helper; in A he's a plain user -> nothing.
    assert.equal(await may(pavel, b.id, helper.id), "user");
    const anna = await prisma.user.create({ data: { email: `${tag}-anna@x.cz`, displayName: "Anna", role: "user", organizationId: a.id } });
    assert.equal(await may(pavel, a.id, anna.id), null, "pavel is not admin in A");
    // Super-admin: anyone but super-admins, any org they're in, with their role there.
    assert.equal(await may(sa, b.id, pavel.id), "admin");
    assert.equal(await may(sa, a.id, pavel.id), "user");
    assert.equal(await may(sa, c.id, pavel.id), null, "pavel is not in C");
    await prisma.user.update({ where: { id: helper.id }, data: { active: false } });
    assert.equal(await may(alias, b.id, helper.id), null, "inactive target");

    await prisma.organization.update({ where: { id: b.id }, data: { active: false } });
    assert.equal(await actingIn(pavel, b.id), null, "deactivated organization");
    assert.equal(await actingIn(sa, b.id), null, "deactivated organization (super-admin)");
    assert.equal(await may(sa, b.id, pavel.id), null, "deactivated organization (view as)");
    console.log("check-org-memberships: ok");
  } finally {
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.organization.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.$disconnect();
  }
})();
