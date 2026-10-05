// Self-check for registration slice 5 (no DB): audience filtering, required
// fields per person, the review tick, answer routing, status "missing".
// npx tsx scripts/test-registration-slice5.ts
import assert from "node:assert/strict";
import { appliesTo, askedFields, askedMissing, checkAnswers, needsReviewTick, routeAnswers, type TemplateRule } from "../src/lib/registration-fields";
import { registrationState } from "../src/lib/registration-status";
import { validateSubmission } from "../src/lib/public-registration";

// --- 1. audience -------------------------------------------------------------------
assert.equal(appliesTo("both", true), true);
assert.equal(appliesTo("both", false), true);
assert.equal(appliesTo(undefined, true), true, "no audience = both (old rows)");
assert.equal(appliesTo("children", false), true);
assert.equal(appliesTo("children", true), false, "an adult never sees children-only fields");
assert.equal(appliesTo("adults", false), false, "and vice versa");
assert.equal(appliesTo("adults", true), true);
assert.equal(appliesTo("children", null), false, "unlinked participant: only fields for both");

// --- 2. required fields per person -------------------------------------------------
const tpl = (key: string, o: Partial<TemplateRule> = {}): TemplateRule => ({ key, label: key, fieldType: "text", options: null, portalAccess: "edit", audience: "both", level: "basic", ...o });
const templates = new Map(
  [
    tpl("pojistovna", { level: "detailed", portalAccess: "approval" }),
    tpl("alergie", { level: "detailed", audience: "children" }),
    tpl("povoleni", { audience: "adults" }),
    tpl("skryte", { portalAccess: "hidden" }),
    tpl("jenvidi", { portalAccess: "read" }),
    tpl("tricko"),
  ].map((t) => [t.key, t])
);
const ef = (key: string, requiredOnRegistration = true, kind = "custom") => ({ key, label: `E ${key}`, fieldType: "text", options: null, kind, requiredOnRegistration });
const eventFields = [ef("pojistovna"), ef("alergie"), ef("povoleni"), ef("skryte"), ef("jenvidi"), ef("tricko", false), ef("autobus"), ef("participant_first_name", true, "builtin")];

const child = askedFields(eventFields, templates, false);
assert.deepEqual(child.map((f) => `${f.key}:${f.source}`), ["pojistovna:profile", "alergie:profile", "autobus:event"], "child: no adults-only, no hidden/read, not-required skipped, builtin skipped");
const adult = askedFields(eventFields, templates, true);
assert.deepEqual(adult.map((f) => f.key), ["pojistovna", "povoleni", "autobus"]);
assert.deepEqual(askedFields(eventFields, templates).map((f) => f.key), ["pojistovna", "alergie", "povoleni", "autobus"], "no audience filter (public form)");
assert.equal(child[0].label, "pojistovna", "template label");
assert.equal(child[2].label, "E autobus", "event question label");
assert.deepEqual(askedFields(eventFields.map((f) => ({ ...f, requiredOnRegistration: false })), templates, false), [], "nothing required = no step (today)");

// --- 3. review tick ----------------------------------------------------------------
assert.equal(needsReviewTick(child, { pojistovna: "VZP" }), true, "pre-filled detailed field shown");
assert.equal(needsReviewTick(child, {}), false, "detailed fields empty -> nothing to review");
assert.equal(needsReviewTick(askedFields([ef("tricko")], templates, false), { tricko: "M" }), false, "basic only");
assert.equal(needsReviewTick(askedFields([ef("autobus")], templates, false), { autobus: "ano" }), false, "event question never pre-filled");

const ok = checkAnswers(child, { pojistovna: " VZP ", alergie: "pyl", autobus: "ano", extra: "x" }, { prefill: { pojistovna: "VZP" }, reviewed: true });
assert.deepEqual(ok, { ok: true, values: { pojistovna: "VZP", alergie: "pyl", autobus: "ano" } }, "trimmed, unknown keys dropped");
assert.deepEqual(checkAnswers(child, { pojistovna: "VZP", alergie: "pyl", autobus: "ano" }, { prefill: { pojistovna: "VZP" }, reviewed: false }), { ok: false, errors: ["reviewed"] }, "tick missing");
assert.deepEqual(checkAnswers(child, { pojistovna: "VZP", alergie: " " }, { prefill: {}, reviewed: false }), { ok: false, errors: ["alergie", "autobus"] }, "all required");
const typed = askedFields([ef("velikost"), ef("datum"), ef("souhlas")].map((f, i) => ({ ...f, fieldType: ["select", "date", "boolean"][i], options: i === 0 ? ["S", "M"] : null })), new Map(), false);
assert.deepEqual(checkAnswers(typed, { velikost: "XL", datum: "2026-13-01" }, { prefill: {}, reviewed: false }), { ok: false, errors: ["velikost", "datum"] }, "invalid select / date");
assert.deepEqual(checkAnswers(typed, { velikost: "M", datum: "2026-07-01" }, { prefill: {}, reviewed: false }), { ok: true, values: { velikost: "M", datum: "2026-07-01", souhlas: "false" } }, "unticked Ano/Ne = false");

// --- 3. answer routing -------------------------------------------------------------
const both = askedFields([ef("pojistovna"), ef("tricko"), ef("autobus")], templates, false);
const live = { pojistovna: "VZP", tricko: "S" };
const r = routeAnswers(both, { pojistovna: "OZP", tricko: "M", autobus: "ano" }, live, live);
assert.deepEqual(r.participant, { pojistovna: "OZP", tricko: "M", autobus: "ano" }, "the participant gets every answer");
assert.deepEqual(r.profile, { tricko: "M" }, "edit field applied to the profile");
assert.deepEqual(r.proposals, [{ key: "pojistovna", oldValue: "VZP", newValue: "OZP" }], "approval field -> pending change");
const same = routeAnswers(both, { pojistovna: "VZP", tricko: "S", autobus: "ne" }, live, live);
assert.deepEqual([same.profile, same.proposals], [{}, []], "unchanged answers touch nothing; event question never in the profile");
const shownPending = { ...live, pojistovna: "ZPMV" };
assert.deepEqual(routeAnswers(both, { pojistovna: "ZPMV", tricko: "S", autobus: "x" }, live, shownPending).proposals, [], "keeping the own pending proposal changes nothing");
assert.deepEqual(routeAnswers(both, { pojistovna: "VZP", tricko: "S", autobus: "x" }, live, shownPending).proposals, [{ key: "pojistovna", oldValue: "VZP", newValue: "VZP" }], "back to live -> withdraws the proposal (proposeChange)");

// --- 5. status "missing" with required fields --------------------------------------
assert.equal(askedMissing(both, { pojistovna: "VZP", tricko: "S" }, { autobus: "ano" }), false);
assert.equal(askedMissing(both, { pojistovna: "VZP", tricko: "" }, { autobus: "ano" }), true, "profile field empty");
assert.equal(askedMissing(both, { pojistovna: "VZP", tricko: "S" }, {}), true, "event question empty on the participant");
assert.equal(askedMissing(both, { pojistovna: "VZP", tricko: "S", autobus: "ano" }, {}), true, "event question isn't read from the profile");
assert.equal(askedMissing(both, null, { pojistovna: "VZP", tricko: "S", autobus: "ano" }), false, "unlinked: the participant's own values");
assert.equal(askedMissing([], {}, {}), false, "no required fields = as slice 4");
const base = { accepted: true, docTypeIds: [], paymentDocTypeId: null, docs: [], pendingProfileChange: false };
assert.equal(registrationState({ ...base, requiredEmpty: false || askedMissing(both, live, {}) }), "missing");
assert.equal(registrationState({ ...base, requiredEmpty: false || askedMissing(both, live, { autobus: "ano" }) }), "complete");

// --- public form: audience ----------------------------------------------------------
const fields = [
  { key: "alergie", label: "Alergie", fieldType: "text", options: null, required: true, audience: "children" as const },
  { key: "povoleni", label: "Povolení", fieldType: "text", options: null, required: true, audience: "adults" as const },
  { key: "autobus", label: "Autobus", fieldType: "text", options: null, required: true, eventOnly: true },
];
const ctx = { fields, rules: null, oddil: null, today: new Date("2026-10-05") };
const person = { firstName: "A", lastName: "B", birthDate: "2015-01-01", isAdult: false, values: { autobus: "ano", alergie: "pyl", povoleni: "x" } };
const res = validateSubmission({ persons: [person], guardians: [{ email: "a@b.cz" }] }, ctx);
assert.ok(res.ok);
assert.deepEqual(res.ok && res.data.persons[0].values, { autobus: "ano", alergie: "pyl" }, "adults-only value dropped for a child");
const noAllergy = validateSubmission({ persons: [{ ...person, isAdult: true, email: "a@b.cz", values: { autobus: "ano" } }] }, ctx);
assert.deepEqual(!noAllergy.ok && noAllergy.errors, ["p0.povoleni"], "an adult isn't asked children-only fields, but adults-only ones");

console.log("ok");
