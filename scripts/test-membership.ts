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
  // Export columns: saved order, unknown keys dropped; nothing saved = every field.
  const { exportFields, readExportColumns } = await import("../src/lib/export-columns");
  const fs = [{ key: "a" }, { key: "b" }, { key: "c" }];
  assert.deepEqual(exportFields(fs, readExportColumns(["c", "x", "a", "c"])).map((f) => f.key), ["c", "a"]);
  assert.deepEqual(exportFields(fs, readExportColumns([])).map((f) => f.key), ["a", "b", "c"]);
  // "Podrobné údaje": the asked fields of the person's age group, filled or how many are missing.
  const { detailsStatus } = await import("../src/lib/document-variables");
  const ask = { adults: [], children: [{ key: "x" }, { key: "y" }], adultChildIds: new Set<string>() } as never;
  const base = { name: "A", groupName: null, dateOfBirth: new Date("2015-01-01"), registrationStatus: "accepted", registrationNumber: null, guardians: [], isAdult: false };
  const ev = { startDate: new Date("2027-03-24"), detailsAsk: ask } as never;
  assert.equal(detailsStatus({ ...base, customFieldValues: { x: "1" } }, ev), "chybí 1");
  assert.equal(detailsStatus({ ...base, customFieldValues: { x: "1", y: "Ne" } }, ev), "vyplněno");
  assert.equal(detailsStatus({ ...base, isAdult: true, customFieldValues: {} }, ev), "");
  // "Cenová kategorie" on the profile: off by default, a bad section falls back to Základní údaje.
  const { readProfileCategory } = await import("../src/lib/portal-rules");
  assert.deepEqual(readProfileCategory(null), { show: false, section: "basic", order: 9999 });
  assert.deepEqual(readProfileCategory({ show: true, section: "sadresa", order: 3 }), { show: true, section: "sadresa", order: 3 });
  assert.equal(readProfileCategory({ show: true, section: "../x" }).section, "basic");
  // Composite "Text s proměnnými": member / non-member blocks and values.
  const { renderCompositeTemplate } = await import("../src/lib/participant-fields");
  const tplVal = (o: Record<string, string>) => (k: string) => o[k];
  const tpl = "{{#clenstvi_rok}}{{Name}} je členem Záře, nižší cena {{price}}{{/clenstvi_rok}}{{^clenstvi_rok}}Nečlen, cena {{price}}{{/clenstvi_rok}}";
  assert.equal(renderCompositeTemplate(tpl, tplVal({ clenstvi_rok: "Ano", Name: "Ema", price: "3000 Kč" })), "Ema je členem Záře, nižší cena 3000 Kč");
  assert.equal(renderCompositeTemplate(tpl, tplVal({ clenstvi_rok: "Ne", Name: "Ema", price: "3300 Kč" })), "Nečlen, cena 3300 Kč");
  // Hromadná úprava odpovědí: grouped case-insensitively, only the picked ones change.
  const { bulkAnswer, distinctAnswers } = await import("../src/lib/bulk-answers");
  assert.deepEqual(distinctAnswers(["ne", " Ne", "pyl", undefined, ""]), [{ value: "ne", count: 2 }, { value: "pyl", count: 1 }]);
  assert.equal(bulkAnswer(" NE ", new Set(["ne"]), null), "");
  assert.equal(bulkAnswer("pyl", new Set(["ne"]), null), "pyl");
  assert.equal(bulkAnswer("Ne", new Set(["ne"]), "bez alergií"), "bez alergií");
  // Dotazy na rodiče: prepared answers cleaned, Ano / Ne added once.
  const { answerButtons, readOptions } = await import("../src/lib/parent-questions");
  assert.deepEqual(readOptions("k snídani\n po snídani \n\nk snídani"), ["k snídani", "po snídani"]);
  assert.deepEqual(answerButtons(["ano", "k snídani"]), ["ano", "k snídani", "Ne"]);
  // Léky a výdej settings: hidden default falls back to the first shown button.
  const { readMedsPageSettings } = await import("../src/lib/meds-page-settings");
  assert.deepEqual(readMedsPageSettings({ presets: ["week", "event"], defaultPreset: "today", fontSize: "xxl" }), { fontSize: "m", presets: ["week", "event"], defaultPreset: "week", exportMode: "blank", exportFormat: "A4" });
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
