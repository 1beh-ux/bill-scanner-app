// P2 (audit2): unknown membership shows "" (lists "—"), never "Ne". npx tsx scripts/check-member-label.ts
import assert from "node:assert/strict";
import { memberLabel } from "../src/lib/document-variables";
import { formatFieldValue } from "../src/lib/participant-fields";

type P = Parameters<typeof memberLabel>[0];
type E = Parameters<typeof memberLabel>[1];
const p = (o: Partial<P>) => ({ name: "Eva", groupName: null, dateOfBirth: null, registrationStatus: "accepted", customFieldValues: {}, registrationNumber: null, guardians: [], childId: null, ...o }) as P;
const connected = { vsMembershipFieldKey: "clenstvi", memberChildIds: new Set(["c1"]), vsMemberValues: [] } as unknown as E;
const plain = { vsMembershipFieldKey: "clenstvi", vsMemberValues: [] } as unknown as E;

assert.equal(memberLabel(p({ childId: "c1" }), connected), "Ano", "in the membership year");
assert.equal(memberLabel(p({ childId: "c2" }), connected), "Ne", "linked, not a member");
assert.equal(memberLabel(p({ childId: null }), connected), "", "not linked: unknown");
assert.equal(memberLabel(p({}), plain), "", "nothing stored: unknown");
assert.equal(memberLabel(p({ customFieldValues: { clenstvi: "ne" } }), plain), "Ne");
assert.equal(memberLabel(p({ customFieldValues: { clenstvi: "ano" } }), plain), "Ano");
assert.equal(formatFieldValue("", "boolean"), "—");
assert.equal(formatFieldValue(undefined, "boolean"), "—");
console.log("check-member-label: all passed");
