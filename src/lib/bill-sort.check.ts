// Self-check: npx tsx src/lib/bill-sort.check.ts
import assert from "node:assert/strict";
import { nextSort, sortBy } from "@/lib/bill-sort";

const words = ["Čapek", "Albert", "", "cukrárna", "Lidl", "Zabka"];
assert.deepEqual(sortBy(words, (w) => w, "asc"), ["Albert", "cukrárna", "Čapek", "Lidl", "Zabka", ""], "Czech order, empty last");
assert.deepEqual(sortBy(words, (w) => w, "desc"), ["Zabka", "Lidl", "Čapek", "cukrárna", "Albert", ""], "empty last also descending");
const nums = [{ v: 1234.5 }, { v: 45 }, { v: null }, { v: 300 }];
assert.deepEqual(sortBy(nums, (x) => x.v, "asc").map((x) => x.v), [45, 300, 1234.5, null], "numbers by value, not as text");
assert.deepEqual(sortBy(nums, (x) => x.v, "desc").map((x) => x.v), [1234.5, 300, 45, null]);
assert.deepEqual(sortBy(["účtenka 10", "účtenka 9"], (x) => x, "asc"), ["účtenka 9", "účtenka 10"], "numbers inside text");
const same = [{ k: "a", n: 1 }, { k: "a", n: 2 }, { k: "b", n: 3 }];
assert.deepEqual(sortBy(same, (x) => x.k, "asc").map((x) => x.n), [1, 2, 3], "stable");
assert.deepEqual(nextSort(null, "amount"), { col: "amount", dir: "asc" });
assert.deepEqual(nextSort({ col: "amount", dir: "asc" }, "amount"), { col: "amount", dir: "desc" });
assert.equal(nextSort({ col: "amount", dir: "desc" }, "amount"), null);
assert.deepEqual(nextSort({ col: "amount", dir: "desc" }, "merchant"), { col: "merchant", dir: "asc" });
console.log("ok");
