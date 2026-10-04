// Self-check for registration slice 3 (no DB): families + family gate, price
// rules, public-form validation, auto-accept mode. npx tsx scripts/test-registration-slice3.ts
import assert from "node:assert/strict";
import { familyContacts, gatePasses, suggestFamilies } from "../src/lib/portal-rules";
import { gateCookieValid, gateCookieValue } from "../src/lib/portal-gate";

// --- B. families -------------------------------------------------------------
const g = (email: string, name: string | null = null) => ({ email, name, phone: null });
const people = [
  { id: "anna", isAdult: false, guardians: [g("mama@x.cz"), g("tata@x.cz")] },
  { id: "petr", isAdult: false, guardians: [g("TATA@x.cz ")] },
  { id: "mama", isAdult: true, guardians: [g("mama@x.cz", "Jana")] },
  { id: "solo", isAdult: false, guardians: [g("jiny@x.cz")] },
  { id: "none", isAdult: false, guardians: [] },
];
assert.deepEqual(
  suggestFamilies(people).map((s) => s.sort()),
  [["anna", "mama", "petr"]],
  "shared guardian e-mails (case/space-insensitive, an adult's own e-mail too) group transitively; singles are no proposal"
);
assert.deepEqual(suggestFamilies([]), []);

const contacts = familyContacts([
  { name: "Jana Nováková", isAdult: true, guardians: [g("mama@x.cz", "Jana")] },
  { name: "Anna", isAdult: false, guardians: [g("Mama@x.cz", "maminka"), g("tata@x.cz", "Petr")] },
  { name: "Petr", isAdult: false, guardians: [g("tata@x.cz", "Petr")] },
]);
assert.deepEqual(
  contacts.map((c) => [c.email, c.member]),
  [
    ["mama@x.cz", "Jana Nováková"],
    ["tata@x.cz", null],
  ],
  "each contact once; the adult member's own e-mail is that member"
);

// Family gate: any member's birth date passes; none on file = never.
const members = [{ dateOfBirth: new Date("2014-05-01") }, { dateOfBirth: new Date("1985-01-31") }, { dateOfBirth: null }];
assert.equal(gatePasses("1985-01-31", members), true);
assert.equal(gatePasses("2014-05-01", members), true);
assert.equal(gatePasses("2014-05-02", members), false);
assert.equal(gatePasses("", members), false);
assert.equal(gatePasses(undefined, members), false);
assert.equal(gatePasses("2014-05-01", []), false);

// Family cookie: scoped to the family subject + current token -- a child's
// cookie never opens the family link (and vice versa), a new token kills it.
const secret = "x".repeat(32);
const famCookie = gateCookieValue("f_fam1", "tokenA", secret);
assert.equal(gateCookieValid(famCookie, "f_fam1", "tokenA", secret), true);
assert.equal(gateCookieValid(famCookie, "f_fam1", "tokenB", secret), false, "new family link => device asked again");
assert.equal(gateCookieValid(gateCookieValue("fam1", "tokenA", secret), "f_fam1", "tokenA", secret), false, "child-scoped cookie with the same id does not pass");

// --- C. price rules ------------------------------------------------------------
async function prices() {
  const { MEMBERSHIP_PRESET: preset, rulePrice, readPriceRules, schoolYearStart, previewPrices, categoryFor } = await import("../src/lib/price-rules");
  const { effectivePriceCzk } = await import("../src/lib/document-variables");
  const start = new Date("2026-01-01");
  const spring = new Date("2026-03-10");
  const autumn = new Date("2026-09-15");
  const price = (category: string, isAdult: boolean, householdCount: number, createdAt = spring, isMember = false) =>
    rulePrice(preset, { category, isAdult, isMember, createdAt, eventStart: start, householdCount });

  // The five decided examples.
  assert.equal(price("oddil", false, 1), 1300, "1 oddíl child");
  assert.deepEqual([price("oddil", false, 2), price("oddil", false, 2)], [1100, 1100], "2 oddíl siblings");
  assert.deepEqual([price("oddil", false, 2), price("oddil", true, 2)], [1100, 400], "oddíl child + adult (adult falls back to ostatni)");
  assert.deepEqual([price("oddil", false, 2, autumn), price("oddil", false, 2, autumn)], [650, 650], "2 siblings from September: school-year price, no household discount");
  assert.equal(price("ostatni", true, 1), 500, "1 adult alone");
  assert.equal(price("ostatni", true, 1, autumn), 500, "ostatni has no school-year price");
  assert.equal(previewPrices({ rules: preset, memberPriceCzk: null, nonMemberPriceCzk: null, eventStart: start, alreadyRegistered: 0, inFamily: true }, [{ category: "oddil", isAdult: false, isMember: false }, { category: "ostatni", isAdult: true, isMember: false }], spring).join("+"), "1100+400", "preview: picks count toward the household");
  assert.deepEqual(previewPrices({ rules: preset, memberPriceCzk: null, nonMemberPriceCzk: null, eventStart: start, alreadyRegistered: 1, inFamily: true }, [{ category: "oddil", isAdult: false, isMember: false }], spring), [1100], "preview: a family member already registered counts");
  assert.deepEqual(previewPrices({ rules: preset, memberPriceCzk: null, nonMemberPriceCzk: null, eventStart: start, alreadyRegistered: 1, inFamily: false }, [{ category: "oddil", isAdult: false, isMember: false }], spring), [1300], "no family = no household");
  assert.deepEqual(previewPrices({ rules: null, memberPriceCzk: 100, nonMemberPriceCzk: 200, eventStart: start, alreadyRegistered: 3, inFamily: true }, [{ isAdult: false, isMember: true }, { isAdult: false, isMember: false }]), [100, 200], "no rules = today's pricing");

  // Member price + categories.
  const withMember = { ...preset, categories: [{ ...preset.categories[1], memberPriceCzk: 300 }] };
  assert.equal(rulePrice(withMember, { category: "ostatni", isAdult: true, isMember: true, createdAt: spring, eventStart: start, householdCount: 1 }), 300);
  assert.equal(rulePrice(withMember, { category: "ostatni", isAdult: true, isMember: true, createdAt: spring, eventStart: start, householdCount: 2 }), 200, "household discount on the member price");
  assert.equal(categoryFor(preset, "oddil", true)?.key, "ostatni", "category not allowed for adults -> first allowed");
  assert.equal(categoryFor(preset, undefined, false)?.key, "oddil", "missing -> first allowed");
  assert.equal(rulePrice({ ...preset, categories: [preset.categories[0]] }, { category: "oddil", isAdult: true, isMember: false, createdAt: spring, eventStart: start, householdCount: 1 }), null, "no category fits");

  // School-year date: the first MM-DD after the start (a September-starting year isn't all half price).
  assert.equal(schoolYearStart(preset, start).toISOString().slice(0, 10), "2026-09-01");
  assert.equal(schoolYearStart(preset, new Date("2026-09-01")).toISOString().slice(0, 10), "2027-09-01");

  // readPriceRules: junk dropped; nothing usable = null (= today's pricing).
  assert.equal(readPriceRules(null), null);
  assert.equal(readPriceRules({ categories: [] }), null);
  assert.equal(readPriceRules({ categories: [{ key: "a", label: "A", priceCzk: 1, forAdults: false, forChildren: false }] }), null, "category for nobody");
  assert.deepEqual(readPriceRules({ categories: [{ key: "a b!", label: " A ", priceCzk: 10, forChildren: true, householdDiscountCzk: -5 }, { key: "ab", label: "dup", priceCzk: 1, forAdults: true }], schoolYearFrom: "13-40", householdMinMembers: 1 }), {
    categories: [{ key: "ab", label: "A", forAdults: false, forChildren: true, priceCzk: 10 }],
    schoolYearFrom: "09-01",
    householdMinMembers: 2,
  });
  assert.deepEqual(readPriceRules(JSON.parse(JSON.stringify(preset))), preset, "preset survives a round trip");

  // Live, retroactive household pricing through effectivePriceCzk (what lists, documents, QR use).
  const event = { id: "m", name: "Členství", startDate: start, memberPriceCzk: 100, nonMemberPriceCzk: 200, registrationBankAccountNumber: null, registrationBankCode: null, vsEventType: null, vsOrderInYear: null, vsMembershipFieldKey: null, mailQuestionnaireUrl: null, qrSizeMm: null, registrationDeadline: null };
  const p = (childId: string, createdAt: Date, priceCategory = "oddil") => ({ name: childId, groupName: null, dateOfBirth: null, registrationStatus: "pending", customFieldValues: {}, registrationNumber: null, guardians: [], childId, createdAt, priceCategory });
  const ctx = (sizes: Record<string, number>, adults: string[] = []) => ({ adultChildIds: new Set(adults), householdSize: new Map(Object.entries(sizes)) });
  assert.equal(effectivePriceCzk(p("anna", spring), { ...event, priceRules: null }), 200, "no rules: exactly today's member/non-member pricing");
  assert.equal(effectivePriceCzk(p("anna", spring), { ...event, priceRules: preset, priceContext: ctx({ anna: 1 }) }), 1300, "first child alone");
  assert.equal(effectivePriceCzk(p("anna", spring), { ...event, priceRules: preset, priceContext: ctx({ anna: 2, petr: 2 }) }), 1100, "sibling registered later lowers anna's price too (retroactive)");
  assert.equal(effectivePriceCzk(p("petr", autumn), { ...event, priceRules: preset, priceContext: ctx({ anna: 2, petr: 2 }) }), 650, "sibling from September: school-year price, never discounted");
  assert.equal(effectivePriceCzk(p("mama", spring, "ostatni"), { ...event, priceRules: preset, priceContext: ctx({ anna: 2, mama: 2 }, ["mama"]) }), 400, "adult in the household");
}

// --- D. public form validation --------------------------------------------------
async function publicForm() {
  const { validateSubmission, isSpam, MAX_PERSONS } = await import("../src/lib/public-registration");
  const { MEMBERSHIP_PRESET: preset } = await import("../src/lib/price-rules");
  const fields = [
    { key: "adresa", label: "Adresa", fieldType: "text", options: null, required: true },
    { key: "pojistovna", label: "Pojišťovna", fieldType: "select", options: ["111", "201"], required: false },
    { key: "plavec", label: "Plavec", fieldType: "boolean", options: null, required: false },
  ];
  const ctx = { fields, rules: preset, oddil: { key: "oddil", options: ["Vlčata", "Skauti"] }, today: new Date("2026-10-04") };
  const adult = { firstName: "Jana", lastName: "Nováková", birthDate: "1985-01-31", isAdult: true, email: "jana@x.cz", phone: "777", guardianOfChildren: true, values: { adresa: "Praha" }, category: "ostatni" };
  const child = { firstName: "Anna", lastName: "Nováková", birthDate: "2015-05-01", isAdult: false, values: { adresa: "Praha", pojistovna: "111", plavec: "true", neznamy: "x" }, category: "oddil", oddil: "Vlčata" };

  const ok = validateSubmission({ persons: [adult, child], guardians: [{ email: "JANA@x.cz" }, { name: "Petr", email: "petr@x.cz" }, { email: "" }], note: " ahoj " }, ctx);
  assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.errors));
  if (ok.ok) {
    const [a, c] = ok.data.persons;
    assert.deepEqual(a.guardians.map((g) => g.email), ["jana@x.cz"], "an adult's guardian row is their own contact");
    assert.deepEqual(c.guardians.map((g) => g.email), ["jana@x.cz", "petr@x.cz"], "children: the ticked adult + extra guardians, each e-mail once, empty rows skipped");
    assert.deepEqual(c.values, { adresa: "Praha", pojistovna: "111", plavec: "true", oddil: "Vlčata" }, "unknown keys dropped, Oddíl stored under its field key");
    assert.equal(c.category, "oddil");
    assert.equal(a.category, "ostatni");
    assert.equal(ok.data.note, "ahoj");
  }
  const err = (body: unknown) => {
    const r = validateSubmission(body, ctx);
    return r.ok ? [] : r.errors;
  };
  assert.deepEqual(err({ persons: [] }), ["persons"]);
  assert.deepEqual(err({ persons: Array(MAX_PERSONS + 1).fill(adult) }), ["persons"], "max 10 people per submit");
  assert.deepEqual(err({ persons: [child] }), ["guardians"], "a child needs a guardian");
  assert.deepEqual(err({ persons: [{ ...adult, guardianOfChildren: false }, child] }), ["guardians"], "an adult not ticked as guardian doesn't count");
  assert.deepEqual(err({ persons: [{ ...adult, email: "nope" }] }), ["p0.email"]);
  assert.deepEqual(err({ persons: [{ ...adult, values: {} }] }), ["p0.adresa"], "required field");
  assert.deepEqual(err({ persons: [adult, { ...child, values: { ...child.values, pojistovna: "999" } }] }), ["p1.pojistovna"], "select value must be an option");
  assert.deepEqual(err({ persons: [adult, { ...child, birthDate: "2027-01-01" }] }), ["p1.birthDate"], "no future birth date");
  assert.deepEqual(err({ persons: [adult, { ...child, oddil: "" }] }), ["p1.oddil"], "oddíl category asks the Oddíl");
  assert.deepEqual(err({ persons: [adult, { ...child, firstName: " " }], guardians: [{ email: "bad" }] }), ["p1.firstName", "g0.email"]);
  assert.deepEqual(err({ persons: [{ ...adult, category: "oddil" }] }), [], "a category not allowed for adults falls back to the first allowed");
  const noRules = validateSubmission({ persons: [{ ...adult, category: "whatever" }] }, { ...ctx, rules: null });
  assert.ok(noRules.ok && noRules.data.persons[0].category === null, "no price rules = no category");
  assert.equal(isSpam({ website: "http://spam" }), true);
  assert.equal(isSpam({ website: "" }), false);
  assert.equal(isSpam(null), false);
}

prices()
  .then(publicForm)
  .then(() => console.log("ok"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
