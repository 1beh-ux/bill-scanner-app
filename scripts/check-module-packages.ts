// Self-check for module packages (src/lib/module-kinds.ts) and the backfill that keeps existing events'
// parts on (prisma/migrations/20261121090100_people_module_parts_backfill).
// The backfill part needs a THROWAWAY database: DATABASE_URL=... npx tsx scripts/check-module-packages.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adultsOn, grantableModules, moduleChanges, modulesOfKind, sendsMail } from "../src/lib/module-kinds";
import { prisma } from "../src/lib/prisma";

// Dependencies.
assert.deepEqual(moduleChanges("health", true), [{ key: "health", enabled: true }, { key: "participants", enabled: true }]);
assert.deepEqual(moduleChanges("registration", true).map((c) => c.key), ["registration", "participants"]);
assert.deepEqual(moduleChanges("health", false), [{ key: "health", enabled: false }]);
assert.deepEqual(moduleChanges("participants", false).map((c) => `${c.key}:${c.enabled}`), ["participants:false", "health:false", "mail:false", "registration:false", "portal:false"]);
assert.deepEqual(moduleChanges("bills", true), [{ key: "bills", enabled: true }]);
assert.ok(adultsOn(["kitchen"]) && adultsOn(["adults"]) && !adultsOn(["bills", "planning"]));
assert.ok(!sendsMail(["bills", "planning"]), "a bills + planning event needs no mailbox");
assert.ok(sendsMail(["registration"]) && sendsMail(["tickets"]));
assert.ok(!grantableModules("event").some((k) => ["adults", "registration", "portal"].includes(k)));
assert.ok(!modulesOfKind("public_event").includes("registration"));

(async () => {
  const tag = `chk-mod-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: tag, shortName: "M" } });
  const mk = (name: string, data: Record<string, unknown> = {}) =>
    prisma.event.create({ data: { name: `${tag} ${name}`, startDate: new Date("2027-07-01"), endDate: new Date("2027-07-10"), organizationId: org.id, ...data } });
  try {
    const billsOnly = await mk("bills");
    const form = await mk("form", { publicRegistration: true });
    const portal = await mk("portal", { portalOpen: true });
    const health = await mk("health");
    const kitchen = await mk("kitchen");
    const pub = await mk("ples", { kind: "public_event", publicRegistration: true });
    await prisma.eventModule.createMany({
      data: [
        { eventId: billsOnly.id, moduleKey: "bills", enabled: true },
        { eventId: health.id, moduleKey: "health", enabled: true },
        { eventId: kitchen.id, moduleKey: "kitchen", enabled: true },
      ],
    });
    const sql = readFileSync("prisma/migrations/20261121090100_people_module_parts_backfill/migration.sql", "utf8");
    for (const stmt of sql.replace(/^--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);

    const on = async (id: string) => (await prisma.eventModule.findMany({ where: { eventId: id, enabled: true } })).map((m) => m.moduleKey).sort();
    assert.deepEqual(await on(billsOnly.id), ["bills"], "bills-only stays bills-only");
    assert.deepEqual(await on(form.id), ["participants", "registration"]);
    assert.deepEqual(await on(portal.id), ["participants", "portal"]);
    assert.deepEqual(await on(health.id), ["health", "participants"]);
    assert.deepEqual(await on(kitchen.id), ["adults", "kitchen"]);
    assert.deepEqual(await on(pub.id), [], "a public event gets no people parts");
    console.log("check-module-packages: ok");
  } finally {
    await prisma.eventModule.deleteMany({ where: { event: { organizationId: org.id } } });
    await prisma.event.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  }
})();
