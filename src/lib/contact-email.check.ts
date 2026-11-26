// Self-check for the contact e-mail rule: `npx tsx src/lib/contact-email.check.ts`
import assert from "node:assert/strict";
import { contactEmail, readContactRule, RECOMMENDED_RULE } from "@/lib/contact-email";

const g = [{ email: "a@x.cz", receivesCommunications: false }, { email: "b@x.cz", receivesCommunications: true }, { email: "c@x.cz", receivesCommunications: true }];
const p = { guardians: g, customFieldValues: { email_ucastnika: "self@x.cz" } };
const AUTO = { ...RECOMMENDED_RULE, adultSelfField: "auto" };
assert.equal(contactEmail(AUTO, p, true, ["email_ucastnika"]), "self@x.cz"); // adult, "auto": own e-mail field first
// "self" (the default): an adult's own contact row (slot 1 = themselves), whatever e-mail fields say.
assert.equal(contactEmail(RECOMMENDED_RULE, p, true, ["email_ucastnika"]), p.guardians[0].email);
assert.equal(readContactRule({ adultSelfField: "self" }).adultSelfField, "self");
assert.equal(contactEmail(RECOMMENDED_RULE, p, false, ["email_ucastnika"]), "b@x.cz"); // child: first receiving guardian
assert.equal(contactEmail(AUTO, { ...p, customFieldValues: {} }, true, ["email_ucastnika"]), "b@x.cz"); // adult without own: guardian
assert.equal(contactEmail({ adultSelfField: null, guardians: "all_receiving" }, p, true, []), "b@x.cz, c@x.cz");
assert.equal(contactEmail({ adultSelfField: null, guardians: "first" }, p, false, []), "a@x.cz");
assert.equal(contactEmail(RECOMMENDED_RULE, { guardians: [{ email: "a@x.cz", receivesCommunications: false }], customFieldValues: null }, false, []), "a@x.cz"); // nobody receiving: first
assert.deepEqual(readContactRule({ adultSelfField: "1bad", guardians: "x" }), { adultSelfField: null, guardians: "first_receiving" });
console.log("contact-email ok");
export {};
