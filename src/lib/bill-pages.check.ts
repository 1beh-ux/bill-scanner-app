// Self-check for the bill page helpers: `npx tsx src/lib/bill-pages.check.ts`
import assert from "node:assert/strict";
import { baseFilename, cutsEvery, groupsFrom, isWholeFile, pagesLabel, validGroups } from "@/lib/bill-pages";

const pages = [0, 1, 2, 3, 4].map((page) => ({ page, removed: page === 2 }));
assert.deepEqual(groupsFrom(pages, new Set()), [[0, 1, 3, 4]]);
assert.deepEqual(groupsFrom(pages, cutsEvery(pages, 1)), [[0], [1], [3], [4]]);
assert.deepEqual(groupsFrom(pages, cutsEvery(pages, 2)), [[0, 1], [3, 4]]);
assert.deepEqual(groupsFrom(pages, cutsEvery(pages, 3)), [[0, 1, 3], [4]]);
assert.deepEqual(groupsFrom(pages, cutsEvery(pages, 0)), [[0, 1, 3, 4]]);
// reordered + a cut after the removed page is ignored
const reordered = [3, 0, 1, 2].map((page) => ({ page, removed: page === 2 }));
assert.deepEqual(groupsFrom(reordered, new Set([0, 2])), [[3, 0], [1]]);

assert.ok(validGroups([[0], [2, 1]], 3));
assert.ok(!validGroups([[0], [0]], 3));
assert.ok(!validGroups([[3]], 3));
assert.ok(!validGroups([[]], 3));
assert.ok(!validGroups([], 3));
assert.ok(!validGroups([[0.5]], 3));
assert.ok(isWholeFile([[0, 1, 2]], 3));
assert.ok(!isWholeFile([[0, 2, 1]], 3));
assert.ok(!isWholeFile([[0, 1]], 3));

assert.equal(pagesLabel([2], 5), "strana 3 z 5");
assert.equal(pagesLabel([0, 1, 2], 5), "strany 1–3 z 5");
assert.equal(pagesLabel([3, 1], 5), "strany 4, 2 z 5");
assert.equal(baseFilename("Lidl (strana 3 z 5).pdf"), "Lidl");
assert.equal(baseFilename("Lidl (strany 1–3 z 5).pdf"), "Lidl");
assert.equal(baseFilename("Lidl (strany 4, 2 z 5) (sloučeno).pdf"), "Lidl");
assert.equal(baseFilename("Účtenka.PDF"), "Účtenka");
console.log("bill-pages ok");
