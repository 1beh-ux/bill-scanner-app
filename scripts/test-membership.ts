// Self-check for child matching and member pricing (no DB). npx tsx scripts/test-membership.ts
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { childKey, nameKey, planLinks } = await import("../src/lib/children");
  const { isMember, effectivePriceCzk } = await import("../src/lib/document-variables");
  const dob = new Date("2015-03-02");
  assert.equal(childKey("Jan  Novák", dob), childKey("jan novak", dob));
  assert.notEqual(childKey("Jan Novák", dob), childKey("Jan Novák", new Date("2015-03-03")));
  assert.equal(childKey("Jan Novák", null), null);
  assert.equal(nameKey("Šárka Dvořáková"), "sarka dvorakova");

  // Same name + birth date: never merged when that would join two different kids.
  const cand = (id: string, eventId: string) => ({ id, eventId, name: "Jan Novák", dateOfBirth: dob });
  assert.deepEqual(planLinks([cand("p1", "e1"), cand("p2", "e2")], []), [{ childId: null, participantIds: ["p1", "p2"] }], "same kid across events");
  assert.deepEqual(planLinks([cand("p1", "e1"), cand("p2", "e1")], []), [], "two in one event = two kids");
  const kid = { id: "c1", name: "Jan Novák", dateOfBirth: dob, eventIds: ["e1"] };
  assert.deepEqual(planLinks([cand("p1", "e1"), cand("p2", "e2")], [kid]), [{ childId: "c1", participantIds: ["p2"] }], "child already in e1");
  assert.deepEqual(planLinks([cand("p2", "e2")], [kid, { ...kid, id: "c2", eventIds: [] }]), [], "two children with the key");

  const p = { name: "Jan", groupName: null, dateOfBirth: dob, registrationStatus: "accepted", customFieldValues: {}, registrationNumber: 1, guardians: [], childId: "c1" };
  const e = { id: "e", name: "T", startDate: dob, memberPriceCzk: 100, nonMemberPriceCzk: 200, registrationBankAccountNumber: null, registrationBankCode: null, vsEventType: null, vsOrderInYear: null, vsMembershipFieldKey: null, mailQuestionnaireUrl: null, qrSizeMm: null, registrationDeadline: null };
  assert.equal(effectivePriceCzk(p, e), 200, "unconnected: manual field only");
  assert.equal(effectivePriceCzk(p, { ...e, memberChildIds: new Set(["c1"]) }), 100, "confirmed member");
  assert.equal(isMember(p, { ...e, memberChildIds: new Set(["c2"]) }), false);
  assert.equal(isMember({ ...p, customFieldValues: { clenstvi_zare: "true" } }, { ...e, memberChildIds: new Set() }), true, "manual field still counts");
  console.log("ok");
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
