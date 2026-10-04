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

console.log("ok");
