// Integration check for the participant sync writes against a throwaway Postgres
// (same setup as scripts/verify-planning-db.ts). No Drive: tables are passed in.
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("verify-participant-sync-db: DATABASE_URL must point at a local throwaway database");
  process.exit(1);
}
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { applyPlan, loadSyncs, planFor, updateSyncs } from "../src/lib/participant-sync-run";
import { type FieldInfo, type SyncSettings } from "../src/lib/participant-sync";

async function main() {
  const event = await prisma.event.create({
    data: { name: "sync test", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-10"), participantsSheetId: "OLD", participantsColumnMapping: { Jméno: "Name", X: "ignore" } },
  });
  const eventId = event.id;
  // old single connection -> first connection, once
  const syncs = await loadSyncs(eventId);
  assert.equal(syncs.length, 1);
  assert.deepEqual(syncs[0].mapping, { Jméno: "Name" });
  assert.equal((await loadSyncs(eventId))[0].id, syncs[0].id);

  const fields: FieldInfo[] = [
    { key: "Name", label: "Jméno", kind: "builtin" },
    { key: "skupina", label: "Skupina", kind: "builtin" },
    { key: "Email", label: "E-mail", kind: "guardian" },
    { key: "formId", label: "ID", kind: "custom" },
    { key: "alergie", label: "Alergie", kind: "custom" },
  ];
  const reg: SyncSettings = { mapping: { ID: "formId", Jméno: "Name", Skupina: "skupina", Mail: "Email" }, matchBy: "formId", onNew: "create", onMatch: "fill", overrides: {}, excluded: [] };
  const regTable = { headers: ["ID", "Jméno", "Skupina", "Mail"], rows: [["A1", "Jan Novák", "A", "m@x.cz"], ["A2", "Eva Malá", "", "t@x.cz"]] };
  let plan = await planFor(eventId, regTable, reg, fields, []);
  let applied = await applyPlan(eventId, plan);
  assert.equal(applied.counts.create, 2);
  assert.deepEqual(applied.seen.sort(), ["a1", "a2"]);

  // second run of the same sheet: nothing to do
  plan = await planFor(eventId, regTable, reg, fields, applied.seen);
  assert.deepEqual(plan.map((r) => r.status), ["same", "same"]);

  // health form: overwrite, fills allergy, adds a second guardian, group overwritten
  const health: SyncSettings = { mapping: { Kód: "formId", Alergie: "alergie", Skupina: "skupina", Mail: "Email" }, matchBy: "formId", onNew: "report", onMatch: "overwrite", overrides: {}, excluded: [] };
  plan = await planFor(eventId, { headers: ["Kód", "Alergie", "Skupina", "Mail"], rows: [["a1", "pyl", "B", "druhy@x.cz"], ["A9", "x", "", ""]] }, health, fields, []);
  assert.deepEqual(plan.map((r) => r.status), ["update", "unmatched"]);
  applied = await applyPlan(eventId, plan);
  const jan = await prisma.participant.findFirstOrThrow({ where: { eventId, name: "Jan Novák" }, include: { guardians: true } });
  assert.equal(jan.groupName, "B");
  assert.deepEqual(jan.customFieldValues, { formId: "A1", alergie: "pyl" });
  assert.deepEqual(jan.guardians.map((g) => g.email).sort(), ["druhy@x.cz", "m@x.cz"]);

  // deleted in the app -> not recreated once seen
  await prisma.participantGuardian.deleteMany({ where: { participantId: jan.id } });
  await prisma.participant.delete({ where: { id: jan.id } });
  plan = await planFor(eventId, regTable, reg, fields, ["a1", "a2"]);
  assert.deepEqual(plan.map((r) => r.status), ["seen_missing", "same"]);

  // concurrent-safe list updates
  await Promise.all([1, 2, 3].map((n) => updateSyncs(eventId, (l) => [...l, { ...l[0], id: `x${n}` }])));
  assert.equal((await loadSyncs(eventId)).length, 4);

  await prisma.participantGuardian.deleteMany({ where: { participant: { eventId } } });
  await prisma.participant.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  console.log("verify-participant-sync-db ok");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
