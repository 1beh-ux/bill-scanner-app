// Self-check for src/lib/event-patch-access.ts: every key PATCH /api/events/[id] reads is classified, and the
// classes say what they should. npx tsx scripts/check-event-patch-access.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRIVE_FOLDER_KEYS, EVENT_PATCH_ACCESS, patchRequirements } from "../src/lib/event-patch-access";

const src = readFileSync("src/app/api/events/[id]/route.ts", "utf8");
const patch = src.slice(src.indexOf("export async function PATCH"), src.indexOf("export async function DELETE"));
// Keys destructured from the body, and any body.x / body["x"] read directly.
const destructured = [...(patch.match(/const \{([^}]*)\} = body;/)?.[1] ?? "").matchAll(/(\w+)/g)].map((m) => m[1]);
const direct = [...patch.matchAll(/body(?:\.(\w+)|\["(\w+)"\])/g)].map((m) => m[1] ?? m[2]);
const read = [...new Set([...destructured, ...direct, ...DRIVE_FOLDER_KEYS])];
assert.ok(destructured.length > 30, `found only ${destructured.length} destructured keys -- did the handler's shape change?`);
const unclassified = read.filter((k) => !(k in EVENT_PATCH_ACCESS));
assert.deepEqual(unclassified, [], `PATCH /api/events/[id] reads keys with no access class: ${unclassified.join(", ")}`);
assert.ok(patch.includes("patchRequirements(body)"), "the handler must check patchRequirements before anything else");

// The classes.
for (const k of ["name", "startDate", "endDate", "kind", "location", "portalOpen", "peopleLinkMode", "eligibility", "priceRules", "membershipYear", "mailQuestionnaireUrl", "registrationBankAccountNumber", ...DRIVE_FOLDER_KEYS])
  assert.equal(EVENT_PATCH_ACCESS[k], "admin", `${k} must be admin-only`);
assert.equal(patchRequirements({ name: "x" }), "admin_only");
assert.equal(patchRequirements({ billsListColumns: [], driveExportFolderId: "x" }), "admin_only");
assert.deepEqual(patchRequirements({ billsListColumns: [], qrSizeMm: 40 }), [["bills"]]);
assert.deepEqual(patchRequirements({ publicSlug: "a" }), [["participants", "tickets"]]);
assert.deepEqual(patchRequirements({ billsListPills: [], publicSlug: "a" }), [["bills"], ["participants", "tickets"]]);
assert.deepEqual(patchRequirements({ unknownKey: 1 }), []);
console.log(`check-event-patch-access: all passed (${read.length} keys classified)`);
