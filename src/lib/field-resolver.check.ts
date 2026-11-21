// Self-check for the Fields Manager resolver (pure parts): `npx tsx src/lib/field-resolver.check.ts`
// Invented guardians and values only.
import assert from "node:assert/strict";
import { classifyKey, extendVariables, guardianSlotValues, orderGuardians, parseGuardianKey, type GuardianIn, type ResolverContext } from "@/lib/field-resolver";
import { BUILTIN_EVENT_KEYS, CODE_VARIABLES, EVENT_VARIABLE_ALIASES, linkedVariableValues } from "@/lib/event-variables";
import { EVENT_KEYS } from "@/lib/template-check";

// --- event variables registry --------------------------------------------------------------------------------
// The "code" keys are exactly today's template-check list (no second hand-kept list drifting away).
assert.deepEqual(new Set(CODE_VARIABLES.map((v) => v.key)), EVENT_KEYS);
// Aliases point at real variables and never at another alias.
for (const [alias, target] of Object.entries(EVENT_VARIABLE_ALIASES)) {
  assert.ok(BUILTIN_EVENT_KEYS.has(target), `${alias} -> ${target}`);
  assert.ok(!BUILTIN_EVENT_KEYS.has(alias), `${alias} is a variable itself`);
}
const linked = linkedVariableValues({
  startDate: new Date(Date.UTC(2027, 6, 3)),
  endDate: new Date(Date.UTC(2027, 6, 17)),
  location: "Tábořiště Testov",
  memberPriceCzk: 4500,
  nonMemberPriceCzk: null,
  registrationBankAccountNumber: "123456789",
  registrationBankCode: "0100",
  bankAccount: { accountNumber: "999", bankCode: "2010" },
  publicContactEmail: null,
  organizationContactEmail: "oddil@example.invalid",
});
assert.deepEqual(linked, {
  date_from: "03.07.2027",
  date_to: "17.07.2027",
  place: "Tábořiště Testov",
  price_member: "4500 Kč",
  price_nonmember: "",
  bank_account: "123456789/0100", // registration account first (Q10)
  contact_email: "oddil@example.invalid",
});
assert.equal(linkedVariableValues({ startDate: new Date(0), bankAccount: { accountNumber: "999", bankCode: "2010" } }).bank_account, "999/2010");

// --- guardian slots ------------------------------------------------------------------------------------------
const g = (name: string, email: string, mail: boolean, position?: number | null): GuardianIn => ({ name, email, relationship: "matka", phone: "+420 999 000 000", receivesCommunications: mail, position });
assert.deepEqual(parseGuardianKey("guardian2_phone", 2), { slot: 2, prop: "phone" });
assert.equal(parseGuardianKey("guardian3_phone", 2), null); // beyond the organization's slots
assert.equal(parseGuardianKey("guardian1_shoe", 6), null);
assert.equal(parseGuardianKey("guardian0_name", 6), null);
assert.equal(parseGuardianKey("zast_jmeno", 6), null);
// Explicit positions first, then stored order (legacy rows have none).
assert.deepEqual(orderGuardians([g("A", "a@example.invalid", true), g("B", "b@example.invalid", true, 1), g("C", "c@example.invalid", true)]).map((x) => x.name), ["B", "A", "C"]);
const slots = guardianSlotValues([g("Matka Smyšlená", "m@example.invalid", false), g("Otec Smyšlený", "o@example.invalid", true)], 3);
assert.equal(slots.guardian1_name, "Matka Smyšlená");
assert.equal(slots.guardian1_mail, "Ne");
assert.equal(slots.guardian2_email, "o@example.invalid");
assert.equal(slots.guardian3_name, ""); // empty slot
assert.equal(Object.keys(slots).length, 15);

// --- extendVariables: only ADDS ------------------------------------------------------------------------------
const ctx: ResolverContext = {
  flagOn: true,
  slots: 2,
  aliases: { ...EVENT_VARIABLE_ALIASES, alergie: "allergies", zast_jmeno: "guardian1_name", stary_klic: "neexistuje" },
  free: { leader_name: "Vedoucí Smyšlený", camp_name: "SHADOW" },
  linked,
};
const today = { camp_name: "Letní tábor 2027", Name: "Kvido Testovský", allergies: "pyl", zast_jmeno: "Otec Smyšlený", date_range: "03.07.2027 – 17.07.2027" };
const guardians = [g("Matka Smyšlená", "m@example.invalid", false), g("Otec Smyšlený", "o@example.invalid", true)];
const out = extendVariables(today, ctx, guardians, new Set(["Name", "allergies", "zast_jmeno", "skryte_pole"]));
for (const [k, v] of Object.entries(today)) assert.equal(out[k], v, `existing key ${k} changed`); // golden rule
assert.equal(out.camp_name, "Letní tábor 2027"); // a free variable can't shadow a built-in
assert.equal(out.leader_name, "Vedoucí Smyšlený");
assert.equal(out.place, "Tábořiště Testov");
assert.equal(out.event_place, "Tábořiště Testov"); // ticket alias
assert.equal(out.event_name, "Letní tábor 2027");
assert.equal(out.org_name, undefined); // organization_name not in this map -> alias stays unset
assert.equal(out.alergie, "pyl"); // field alias
assert.equal(out.zast_jmeno, "Otec Smyšlený"); // the fixed field wins over its legacy alias (first guardian with mail)
assert.equal(out.guardian1_name, "Matka Smyšlená"); // slot 1 = first guardian, regardless of mail
assert.equal(out.stary_klic, undefined); // alias to nothing
// A key that is one of the event's own fields is never filled by the resolver (today it prints nothing / its field).
const own = extendVariables({}, ctx, guardians, new Set(["place", "guardian1_name", "alergie"]));
assert.equal(own.place, undefined);
assert.equal(own.guardian1_name, undefined);
assert.equal(own.alergie, undefined);

// --- classifyKey ---------------------------------------------------------------------------------------------
const fields = new Set(["allergies", "pojistovna"]);
assert.equal(classifyKey("camp_name", ctx, fields).kind, "event_variable");
assert.equal(classifyKey("place", ctx, fields).kind, "event_variable");
assert.equal(classifyKey("leader_name", ctx, fields).kind, "event_variable");
assert.deepEqual(classifyKey("event_place", ctx, fields), { kind: "event_variable", canonical: "place", viaAlias: true });
assert.deepEqual(classifyKey("guardian2_email", ctx, fields), { kind: "guardian", canonical: "guardian2_email", slot: 2, prop: "email", viaAlias: false });
assert.equal(classifyKey("guardian3_email", ctx, fields).kind, "unresolved");
assert.deepEqual(classifyKey("alergie", ctx, fields), { kind: "field", canonical: "allergies", viaAlias: true });
assert.deepEqual(classifyKey("zast_jmeno", ctx, fields), { kind: "guardian", canonical: "guardian1_name", slot: 1, prop: "name", viaAlias: true });
assert.equal(classifyKey("pojistovna", ctx, fields).kind, "field");
assert.equal(classifyKey("stary_klic", ctx, fields).kind, "unresolved");
assert.equal(classifyKey("nic", ctx, fields).kind, "unresolved");

console.log("field-resolver: ok");
