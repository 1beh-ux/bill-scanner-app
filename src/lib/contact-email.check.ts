// Self-check for the contact e-mail rule: `npx tsx src/lib/contact-email.check.ts`
import assert from "node:assert/strict";
import { contactEmail, readContactRule, RECOMMENDED_RULE } from "@/lib/contact-email";

const g = [{ email: "a@x.cz", receivesCommunications: false }, { email: "b@x.cz", receivesCommunications: true }, { email: "c@x.cz", receivesCommunications: true }];
const p = { guardians: g, customFieldValues: { email_ucastnika: "self@x.cz" } };
assert.equal(contactEmail(RECOMMENDED_RULE, p, true, ["email_ucastnika"]), "self@x.cz"); // adult: own e-mail first
assert.equal(contactEmail(RECOMMENDED_RULE, p, false, ["email_ucastnika"]), "b@x.cz"); // child: first receiving guardian
assert.equal(contactEmail(RECOMMENDED_RULE, { ...p, customFieldValues: {} }, true, ["email_ucastnika"]), "b@x.cz"); // adult without own: guardian
assert.equal(contactEmail({ adultSelfField: null, guardians: "all_receiving" }, p, true, []), "b@x.cz, c@x.cz");
assert.equal(contactEmail({ adultSelfField: null, guardians: "first" }, p, false, []), "a@x.cz");
assert.equal(contactEmail(RECOMMENDED_RULE, { guardians: [{ email: "a@x.cz", receivesCommunications: false }], customFieldValues: null }, false, []), "a@x.cz"); // nobody receiving: first
assert.deepEqual(readContactRule({ adultSelfField: "1bad", guardians: "x" }), { adultSelfField: null, guardians: "first_receiving" });
console.log("contact-email ok");
export {};
