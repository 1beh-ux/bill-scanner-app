// R4-3 (audit2): a public registration's extra guardian needs a name. npx tsx scripts/check-public-guardian.ts
import assert from "node:assert/strict";
import { validateSubmission } from "../src/lib/public-registration";

const ctx = { fields: [], rules: null, oddil: null, today: new Date("2027-01-01") };
const child = { firstName: "Eva", lastName: "Nová", birthDate: "2016-05-05", isAdult: false };
const r1 = validateSubmission({ persons: [child], guardians: [{ email: "mama@test.invalid" }] }, ctx);
assert.ok(!r1.ok && r1.errors.includes("g0.name"), JSON.stringify(r1));
const r2 = validateSubmission({ persons: [child], guardians: [{ name: "Jana Nová", email: "mama@test.invalid" }] }, ctx);
assert.ok(r2.ok || !r2.errors.some((e) => e.startsWith("g0.")), JSON.stringify(r2));
console.log("check-public-guardian: all passed");
