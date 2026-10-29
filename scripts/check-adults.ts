// Self-check for the adults report (src/lib/adults.ts). npx tsx scripts/check-adults.ts
import assert from "node:assert/strict";
import { adultReportRows, dayIntervals, daysAtEvent, intervalsText, presentDays, reportCsv, reportTotals } from "../src/lib/adults";
import { ageOn } from "../src/lib/age";

// Age on a date: the birthday itself counts.
assert.equal(ageOn("2008-07-01", new Date("2026-07-01T00:00:00Z")), 18);
assert.equal(ageOn("2008-07-02", new Date("2026-07-01T00:00:00Z")), 17);
assert.equal(ageOn(null, new Date()), null);

// Days: none set = the whole event; only days inside the event count; intervals for "came, left, came back".
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `2026-07-${String(a + i).padStart(2, "0")}`);
assert.equal(daysAtEvent([], "2026-07-01", "2026-07-14"), 14);
assert.equal(daysAtEvent(["2026-06-30", ...range(1, 3)], "2026-07-01", "2026-07-14"), 3);
assert.equal(daysAtEvent(["2026-06-01"], "2026-07-01", "2026-07-14"), 0);
const split = [...range(1, 2), ...range(5, 8)];
assert.deepEqual(dayIntervals([...split].reverse()), [{ from: "2026-07-01", to: "2026-07-02" }, { from: "2026-07-05", to: "2026-07-08" }]);
assert.equal(intervalsText(split), "1.–2. 7., 5.–8. 7.");
assert.equal(intervalsText(["2026-06-30", "2026-07-01"]), "30. 6. – 1. 7.");
assert.equal(presentDays([], "2026-07-01", "2026-07-03").length, 3);

const rows = adultReportRows(
  [
    { name: "Jana", dateOfBirth: "2008-07-01", fieldValues: { adresa_mesto: "Praha", adresa_psc: "18200" }, days: [] },
    { name: "Petr; „Péťa“", dateOfBirth: "1990-01-01", fieldValues: null, days: ["2026-06-30", ...range(1, 5)] },
    { name: "Bez data", dateOfBirth: null, fieldValues: null, days: [...range(1, 1), ...range(2, 2)] },
  ],
  "2026-07-01",
  "2026-07-14",
  "2026-07-01"
);
assert.deepEqual(rows.map((r) => [r.age, r.days, r.outside]), [[18, 14, false], [36, 5, true], [null, 2, false]]);
assert.equal(rows[0].municipality, "Praha");
assert.deepEqual(reportTotals(rows, 18, 26), { people: 3, personDays: 21, inRange: 1, inRangeDays: 14 });
assert.deepEqual(reportTotals(rows, null, null).inRange, 2);
assert.equal(rows[1].periods, "30. 6. – 5. 7.");
const csv = reportCsv(rows, ["Jméno", "Datum narození", "Věk", "Obec", "PSČ", "Od", "Do", "Termíny", "Dní"]);
assert.ok(csv.startsWith("﻿Jméno;"));
assert.ok(csv.includes('"Petr; „Péťa“"'));
console.log("adults ok");
