// Self-check for the participant layout editor: `npx tsx src/lib/participant-layout.check.ts`
import assert from "node:assert/strict";
import {
  defaultDetailLayout,
  detailFieldOrder,
  healthConfigForDetail,
  healthConfigForNotes,
  moveField,
  moveSection,
  resolveDetailLayout,
  resolveHealthLayout,
  sanitizePageLayout,
} from "@/lib/participant-layout";

const fields = [
  { key: "tricko", kind: "custom", fieldType: "text", surfaces: ["list"] },
  { key: "allergies", kind: "custom", fieldType: "text", surfaces: ["health_detail", "health_list"] },
  { key: "full", kind: "custom", fieldType: "composite", surfaces: [] },
  { key: "plavec", kind: "custom", fieldType: "boolean", surfaces: [] },
  { key: "email", kind: "builtin", fieldType: "text", surfaces: [] },
];
const config = [{ fieldKey: "allergies", places: ["detail", "meds"] as ("detail" | "meds")[], highlight: false }];

// Default = today's page.
const def = defaultDetailLayout(fields, config);
assert.deepEqual(def.sections.map((s) => [s.kind, s.column, s.fields]), [
  ["basics", "left", []],
  ["guardians", "left", []],
  ["documents", "right", undefined],
  ["fields", "right", ["tricko", "plavec"]],
  ["health", "right", ["allergies"]],
]);
assert.deepEqual(resolveDetailLayout(null, fields, config), def);

// Resolve: unknown keys/sections dropped, fixed sections ensured, new fields appended, health follows the config.
const saved = {
  sections: [
    { id: "s1", kind: "fields" as const, column: "left" as const, title: "Oblečení", fields: ["gone", "allergies", "tricko"] },
    { id: "h", kind: "health" as const, column: "left" as const, hidden: true, fields: [] },
    { id: "b", kind: "basics" as const, column: "right" as const, hidden: true },
  ],
  hiddenFields: ["plavec"],
};
const r = resolveDetailLayout(saved, fields, config);
assert.deepEqual(r.sections.map((s) => [s.id, s.kind, s.column, s.hidden, s.fields]), [
  ["s1", "fields", "left", undefined, ["tricko"]],
  ["h", "health", "left", true, ["allergies"]],
  ["b", "basics", "right", undefined, []],
  ["guardians", "guardians", "left", undefined, []],
  ["documents", "documents", "right", undefined, undefined],
]);
assert.deepEqual(r.hiddenFields, ["plavec"]);
// Extra fields under the fixed sections (name / guardians) are kept.
assert.deepEqual(
  resolveDetailLayout({ sections: [{ id: "b", kind: "basics" as const, column: "left" as const, fields: ["tricko"] }] }, fields, config).sections.find((x) => x.kind === "basics")?.fields,
  ["tricko"]
);
// Not hidden and not placed -> first fields section.
assert.deepEqual(resolveDetailLayout({ ...saved, hiddenFields: [] }, fields, config).sections[0].fields, ["tricko", "plavec"]);

// Editing + write-back.
let l = moveField(def, "allergies", "fields", "tricko"); // out of health
l = moveField(l, "plavec", null); // hide
l = moveSection(l, "health", "basics", "left");
assert.deepEqual(detailFieldOrder(l), ["allergies", "tricko", "plavec"]);
assert.deepEqual(healthConfigForDetail(config, ["allergies"], []), []);
assert.deepEqual(healthConfigForDetail(config, ["allergies"], ["allergies"]), null);
assert.deepEqual(healthConfigForDetail(config, ["allergies"], ["allergies", "tricko"]), [
  ...config,
  { fieldKey: "tricko", places: ["detail", "meds", "incident", "pdf"], highlight: false },
]);

// Zdraví notes: reorder in the "detail" slots, drop/gain "detail", add new.
const hc = [
  { fieldKey: "a", places: ["detail" as const], highlight: false },
  { fieldKey: "p", places: ["pdf" as const], highlight: true },
  { fieldKey: "b", places: ["detail" as const, "pdf" as const], highlight: false },
];
assert.deepEqual(healthConfigForNotes(hc, ["b", "a"]).map((c) => c.fieldKey), ["b", "p", "a"]);
assert.deepEqual(healthConfigForNotes(hc, ["x", "b"]), [
  { fieldKey: "a", places: [], highlight: false },
  { fieldKey: "p", places: ["pdf"], highlight: true },
  { fieldKey: "x", places: ["detail"], highlight: false },
  { fieldKey: "b", places: ["detail", "pdf"], highlight: false },
]);

// Sanitize + health layout.
const s = sanitizePageLayout({ sections: [{ id: "x", kind: "nope" }, { id: "f", kind: "fields", column: "left", fields: ["tricko", "evil"], title: 5 }], hiddenFields: "x" }, "detail", new Set(["tricko"]));
assert.deepEqual(s, { sections: [{ id: "f", kind: "fields", column: "left", fields: ["tricko"] }], hiddenFields: [] });
assert.equal(sanitizePageLayout("junk", "health", new Set()), null);
// Old documents/e-mails sections are gone; own "fields" sections keep title + known fields.
const hl = resolveHealthLayout(
  {
    sections: [
      { id: "emails", kind: "emails" as never, column: "left", hidden: true },
      { id: "q", kind: "fields", column: "left", title: "Dotazník", fields: ["plavec", "gone"] },
      { id: "incidents", kind: "incidents", column: "left", hidden: true },
    ],
  },
  new Set(["plavec"])
);
assert.deepEqual(hl.sections.map((x) => x.id + (x.hidden ? "-" : "")), ["q", "incidents-", "notes", "guardians", "medsReported", "medPlans"]);
assert.deepEqual(hl.sections[0], { id: "q", kind: "fields", column: "left", title: "Dotazník", fields: ["plavec"] });

console.log("participant-layout ok");
