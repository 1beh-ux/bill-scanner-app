// Self-check for the pure import helpers: `npx tsx src/lib/planning-import.check.ts`
import assert from "node:assert/strict";
import { guessMapping, layoutDay, parseDate, parseDuration, parseGroupNames, parseTable, parseTimeOfDay, parseTimeRange } from "@/lib/planning-import";

// Tables: tabs win; else ; vs , by column count; CSV quoting incl. newlines.
assert.deepEqual(parseTable("a\tb\n1\t2\n"), [["a", "b"], ["1", "2"]]);
assert.deepEqual(parseTable('Den;Aktivita\n10.7.;"Hra; venku"\r\n'), [["Den", "Aktivita"], ["10.7.", "Hra; venku"]]);
assert.deepEqual(parseTable('a,b\n"x ""y""","line1\nline2"\n\n'), [["a", "b"], ['x "y"', "line1\nline2"]]);

// Header guessing: exact before contains; each field once; diacritics ignored.
assert.deepEqual(guessMapping(["Datum", "Od", "Do", "Aktivita", "Vedoucí", "Místo", "Skupina", "Něco"], "schedule"), [
  "date", "start", "end", "activity", "leader", "location", "groups", "",
]);
assert.deepEqual(guessMapping(["Čas (od-do)", "Název programu", "Hlavní kategorie"], "schedule"), ["time", "activity", "primaryCategory"]);
assert.deepEqual(guessMapping(["Jméno", "Telefon"], "leaders"), ["name", "phone"]);

// Times, ranges, durations, dates.
assert.deepEqual(["9", "9:00", "09.30", "9:00:00", "13,15", "0.375", "9h"].map(parseTimeOfDay), [540, 540, 570, 540, 795, 540, 540]);
assert.equal(parseTimeOfDay("25:00"), null);
assert.deepEqual(parseTimeRange("9:00 – 10.30"), { start: 540, end: 630 });
assert.equal(parseTimeRange("10-9"), null);
assert.deepEqual(["45", "45 min", "45'", "1:30", "1,5 h", "1h30", "1 h 30 min", "2 hodiny"].map(parseDuration), [45, 45, 45, 90, 90, 90, 90, 120]);
assert.equal(parseDuration("hra"), null);
assert.equal(parseDate("10.7.2026", 2025), "2026-07-10");
assert.equal(parseDate("Po 10. 7.", 2026), "2026-07-10");
assert.equal(parseDate("2026-07-10", 2000), "2026-07-10");
assert.equal(parseDate("31.2.2026", 2026), null);
assert.equal(parseDate("Den 1", 2026), null);
assert.deepEqual(parseGroupNames("Vlci, Lišky / Vlci"), ["Vlci", "Lišky"]);

// Layout: back-to-back rows chain, same start = parallel, gap = new window,
// overlap without same start = parallel window, explicit window names respected.
const r = (index: number, start: number, end: number, windowName?: string) => ({ index, start, end, windowName });
const { windows, unequal } = layoutDay([
  r(0, 540, 600), r(1, 600, 660), r(2, 600, 645), // 9-10, then two parallel from 10 (45 vs 60 min)
  r(3, 840, 900), // 14:00 after a gap -> new window
  r(4, 870, 930), // overlaps 14:00-15:00 -> its own window
  r(5, 1140, 1200, "Večerní program"),
]);
assert.deepEqual(windows.map((w) => [w.name, w.startMin, w.endMin, w.slots.map((s) => s.rows.map((x) => x.index))]), [
  ["Dopoledne", 540, 660, [[0], [1, 2]]],
  ["Odpoledne", 840, 900, [[3]]],
  ["Odpoledne", 870, 930, [[4]]],
  ["Večerní program", 1140, 1200, [[5]]],
]);
assert.deepEqual(unequal.map((g) => g.map((x) => x.index)), [[1, 2]]);
console.log("planning-import.check: ok");
