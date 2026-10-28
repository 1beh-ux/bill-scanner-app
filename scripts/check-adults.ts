// Self-check for the adults report (src/lib/adults.ts). npx tsx scripts/check-adults.ts
import assert from "node:assert/strict";
import { adultReportRows, daysAtEvent, reportCsv, reportTotals } from "../src/lib/adults";
import { ageOn } from "../src/lib/age";

// Age on a date: the birthday itself counts.
assert.equal(ageOn("2008-07-01", new Date("2026-07-01T00:00:00Z")), 18);
assert.equal(ageOn("2008-07-02", new Date("2026-07-01T00:00:00Z")), 17);
assert.equal(ageOn(null, new Date()), null);

// Days: inclusive, clipped to the event; null dates = the event's; outside = 0.
assert.equal(daysAtEvent(null, null, "2026-07-01", "2026-07-14"), 14);
assert.equal(daysAtEvent("2026-06-30", "2026-07-03", "2026-07-01", "2026-07-14"), 3);
assert.equal(daysAtEvent("2026-07-10", null, "2026-07-01", "2026-07-14"), 5);
assert.equal(daysAtEvent("2026-06-01", "2026-06-10", "2026-07-01", "2026-07-14"), 0);

const rows = adultReportRows(
  [
    { name: "Jana", dateOfBirth: "2008-07-01", fieldValues: { adresa_mesto: "Praha", adresa_psc: "18200" }, fromDate: null, toDate: null },
    { name: "Petr; „Péťa“", dateOfBirth: "1990-01-01", fieldValues: null, fromDate: "2026-06-30", toDate: "2026-07-05" },
    { name: "Bez data", dateOfBirth: null, fieldValues: null, fromDate: null, toDate: "2026-07-02" },
  ],
  "2026-07-01",
  "2026-07-14",
  "2026-07-01"
);
assert.deepEqual(rows.map((r) => [r.age, r.days, r.outside]), [[18, 14, false], [36, 5, true], [null, 2, false]]);
assert.equal(rows[0].municipality, "Praha");
assert.deepEqual(reportTotals(rows, 18, 26), { people: 3, personDays: 21, inRange: 1, inRangeDays: 14 });
assert.deepEqual(reportTotals(rows, null, null).inRange, 2);
const csv = reportCsv(rows, ["Jméno", "Datum narození", "Věk", "Obec", "PSČ", "Od", "Do", "Dní"]);
assert.ok(csv.startsWith("﻿Jméno;"));
assert.ok(csv.includes('"Petr; „Péťa“"'));
console.log("adults ok");
