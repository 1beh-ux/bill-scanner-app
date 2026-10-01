// Self-check for Zdravotní poznámky: `npx tsx src/lib/health-notes.check.ts`
import assert from "node:assert/strict";
import { defaultHealthNotes, healthNotesText, notesFor, sanitizeHealthNotes } from "@/lib/health-notes";

// Default = what the app showed before: Zdraví fields on the screens, the old 4 in the PDF.
const fields = [
  { key: "allergies", kind: "custom", surfaces: ["health_detail", "health_list"] },
  { key: "medsNotes", kind: "custom", surfaces: ["health_detail"] },
  { key: "otherNotes", kind: "custom", surfaces: [] },
  { key: "tricko", kind: "custom", surfaces: ["list"] },
];
assert.deepEqual(defaultHealthNotes(fields), [
  { fieldKey: "allergies", places: ["detail", "meds", "incident", "pdf"], highlight: false },
  { fieldKey: "medsNotes", places: ["detail", "meds", "incident", "pdf"], highlight: false },
  { fieldKey: "otherNotes", places: ["pdf"], highlight: false },
]);

// Sanitize: unknown fields, repeats and places dropped.
assert.deepEqual(
  sanitizeHealthNotes(
    [{ fieldKey: "allergies", places: ["list", "bogus"], highlight: true }, { fieldKey: "allergies", places: [] }, { fieldKey: "nope", places: ["pdf"] }],
    new Set(["allergies"])
  ),
  [{ fieldKey: "allergies", places: ["list"], highlight: true }]
);

// One place, configured order, empty values skipped.
const config = [
  { fieldKey: "medsNotes", places: ["detail" as const], highlight: false },
  { fieldKey: "allergies", places: ["detail" as const, "list" as const], highlight: true },
  { fieldKey: "otherNotes", places: ["detail" as const], highlight: false },
];
const notes = notesFor(config, "detail", { allergies: "pyl", medsNotes: " Zyrtec ", otherNotes: "" }, { allergies: "Alergie", medsNotes: "Léky" });
assert.deepEqual(notes.map((n) => [n.key, n.value, n.highlight]), [["medsNotes", "Zyrtec", false], ["allergies", "pyl", true]]);
assert.deepEqual(notesFor(config, "list", { allergies: "pyl" }, {}).map((n) => n.key), ["allergies"]);
assert.equal(healthNotesText(notes), "Léky: Zyrtec\nAlergie: pyl");
console.log("health-notes ok");
