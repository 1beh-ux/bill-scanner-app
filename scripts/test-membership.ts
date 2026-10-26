// Self-check for child matching and member pricing (no DB). npx tsx scripts/test-membership.ts
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { childKey, nameKey, planLinks, adultAt, membershipYearOf } = await import("../src/lib/children");
  const { readEmailFiles } = await import("../src/lib/email-files");
  const { isMember, effectivePriceCzk, buildVariableSymbol } = await import("../src/lib/document-variables");
  const dob = new Date("2015-03-02");
  assert.equal(childKey("Jan  Novák", dob), childKey("jan novak", dob));
  assert.notEqual(childKey("Jan Novák", dob), childKey("Jan Novák", new Date("2015-03-03")));
  assert.equal(childKey("Jan Novák", null), null);
  assert.equal(nameKey("Šárka Dvořáková"), "sarka dvorakova");
  // Auto-created people: 18 on the event's first day is an adult, the day before isn't.
  assert.equal(adultAt(new Date("2008-11-01"), new Date("2026-11-01")), true);
  assert.equal(adultAt(new Date("2008-11-02"), new Date("2026-11-01")), false);
  assert.equal(adultAt(null, new Date("2026-11-01")), false);
  // The membership year an event checks: its setting, else its start year.
  assert.equal(membershipYearOf({ membershipCheckYear: null, startDate: new Date("2027-03-24") }), 2027);
  assert.equal(membershipYearOf({ membershipCheckYear: 2026, startDate: new Date("2027-03-24") }), 2026);
  // The template an event sends: its portal case for the acceptance / status e-mail, else the asked one.
  const { eventTemplateKey, kindForEvent } = await import("../src/lib/email-kinds");
  const portal = { registrationConnected: true, kind: "event" }, plain = { registrationConnected: false, kind: "event" }, year = { registrationConnected: false, kind: "membership" };
  assert.equal(eventTemplateKey(portal, "registration_acceptance"), "registration_acceptance_portal");
  assert.equal(eventTemplateKey(year, "mail_helper_bulk_status_update"), "mail_helper_bulk_status_link");
  assert.equal(eventTemplateKey(plain, "registration_acceptance"), "registration_acceptance");
  assert.equal(eventTemplateKey(portal, "custom_x"), "custom_x");
  assert.equal(kindForEvent({ when: "portal" }, plain), false);
  assert.equal(kindForEvent({ when: "noPortal" }, plain), true);
  assert.equal(kindForEvent({}, portal), true);
  // Stored e-mail files: bad rows dropped, empty keys gone.
  const f = { id: "a", name: "x.pdf", type: "application/pdf", size: 3, path: "email-files/o/a-x.pdf" };
  assert.deepEqual(readEmailFiles({ portal_link: [f, { id: 1 }], x: [], y: "no" }), { portal_link: [f] });

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
  const vs = buildVariableSymbol({ ...p, registrationNumber: 7 }, { ...e, startDate: new Date("2026-10-01") });
  assert.equal(vs.slice(0, 2), "26", "VS year from start date");
  assert.equal(buildVariableSymbol({ ...p, registrationNumber: 7 }, { ...e, startDate: new Date("2026-10-01"), vsYear: 27 }).slice(0, 2), "27", "VS year override");
  console.log("ok");
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
