// Self-check for the panel hints: `npx tsx src/lib/field-hints.check.ts`
import assert from "node:assert/strict";
import { fieldHints } from "@/lib/field-hints";
import type { OvField } from "@/lib/fields-overview";

const base: OvField = { key: "alergie", label: "Alergie", fieldType: "text", kind: "custom", group: "basic", storage: "profile", calculated: false, deps: [], surfaces: ["list"], active: true, required: false, requiredDefault: false, portalAccess: "edit", level: "basic", fromTemplate: true, aliases: ["allergies"], values: { profiles: 3, registrations: 2 }, sources: [], uses: ["lists"], options: null, computedType: null, system: false, locked: false };
const ids = (f: OvField, docs = null as never, extra = {}) => fieldHints(f, [f], docs, extra).map((h) => h.id);
assert.deepEqual(ids(base), []);
assert.deepEqual(ids({ ...base, required: true, portalAccess: "hidden" }), ["asked_hidden"]);
assert.deepEqual(ids(base, [{ docTypeId: "d", name: "D", placeholders: [{ key: "allergies" }] }] as never), ["docs_switched_off", "old_name_in_docs"]);
assert.deepEqual(ids({ ...base, calculated: true, deps: ["nope"] }), ["calc_missing"]);
assert.deepEqual(ids({ ...base, values: { profiles: 0, registrations: 0 }, uses: [] }), ["unused"]);
assert.deepEqual(ids({ ...base, active: false, sources: ["sync:1"] }), ["synced_inactive"]);
assert.deepEqual(ids({ ...base, computedType: "contact_email", kind: "computed" }, null as never, { contactMissing: 4 }), ["contact_missing"]);
console.log("field-hints ok");
export {};
