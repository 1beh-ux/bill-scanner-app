// Self-check for the 24 h date / time parsing (src/components/DateTimeFields.tsx): npx tsx scripts/check-date-fields.ts
import assert from "node:assert/strict";
import { parseDate, parseTime, showDate } from "../src/components/DateTimeFields";

assert.equal(parseDate("23.10.2026", 2025), "2026-10-23");
assert.equal(parseDate("23. 10. 2026", 2025), "2026-10-23");
assert.equal(parseDate("23.10.", 2026), "2026-10-23");
assert.equal(parseDate("1.2", 2026), "2026-02-01");
assert.equal(parseDate("23/10/26", 2020), "2026-10-23");
assert.equal(parseDate("2026-10-23", 2020), "2026-10-23");
assert.equal(parseDate("31.2.2026", 2026), null);
assert.equal(parseDate("29.2.2028", 2026), "2028-02-29");
assert.equal(parseDate("abc", 2026), null);
assert.equal(parseDate("", 2026), "");
assert.equal(showDate("2026-10-03"), "3. 10. 2026");
assert.equal(parseTime("14:30"), "14:30");
assert.equal(parseTime("1430"), "14:30");
assert.equal(parseTime("930"), "09:30");
assert.equal(parseTime("14"), "14:00");
assert.equal(parseTime("0"), "00:00");
assert.equal(parseTime("9.5"), "09:05");
assert.equal(parseTime("24:00"), null);
assert.equal(parseTime("12:60"), null);
assert.equal(parseTime(""), "");
console.log("check-date-fields: all passed");
