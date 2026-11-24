// Self-check for the Formulář question settings: `npx tsx src/lib/form-config.check.ts`
import assert from "node:assert/strict";
import { applyFormChange, effectiveFormConfig, legacyFormConfig, readFormConfig } from "@/lib/form-config";

const custom = { kind: "custom", active: true, requiredOnRegistration: false };
const tpl = (o: Partial<{ portalAccess: string; level: string; audience: string; requiredInRegistration: boolean }> = {}) => ({ portalAccess: "edit", level: "basic", audience: "both", requiredInRegistration: false, ...o });

// Today's rules, reproduced:
assert.deepEqual(legacyFormConfig(custom, tpl(), false), { ask: true, required: false, audience: "both", when: "registration", label: null, hint: null }); // basic portal field: asked, optional
assert.equal(legacyFormConfig(custom, tpl({ requiredInRegistration: true }), false).required, true);
assert.equal(legacyFormConfig(custom, tpl({ level: "detailed" }), false).ask, false); // detailed, not marked: not asked
assert.deepEqual(legacyFormConfig({ ...custom, requiredOnRegistration: true }, tpl({ level: "detailed" }), true), { ask: true, required: true, audience: "both", when: "after", label: null, hint: null }); // marked + two-step
assert.equal(legacyFormConfig({ ...custom, requiredOnRegistration: true }, tpl({ portalAccess: "hidden" }), false).ask, false); // hidden from parents: never asked
assert.equal(legacyFormConfig({ ...custom, requiredOnRegistration: true }, tpl({ portalAccess: "read", level: "detailed" }), false).ask, false); // read-only: the flag doesn't ask it
assert.deepEqual(legacyFormConfig({ ...custom, requiredOnRegistration: true }, null, false), { ask: true, required: true, audience: null, when: "registration", label: null, hint: null }); // event question
assert.equal(legacyFormConfig({ ...custom, kind: "builtin" }, tpl(), false).ask, false);
assert.equal(legacyFormConfig({ ...custom, active: false }, tpl(), false).ask, false);

// Saved settings win; changes apply only the given keys; not asked = not required.
const saved = { ask: true, required: true, audience: "children", when: "registration", label: "Má dítě alergii?", hint: null };
assert.equal(effectiveFormConfig({ ...custom, formConfig: saved }, tpl({ portalAccess: "hidden" }), false).ask, true); // independent of the portal
assert.deepEqual(applyFormChange(readFormConfig(saved)!, { ask: false }), { ...saved, ask: false, required: false });
assert.equal(applyFormChange(readFormConfig(saved)!, { label: "  " }).label, null); // empty wording = the field's name
assert.equal(readFormConfig("nonsense"), null);
console.log("form-config ok");
export {};
