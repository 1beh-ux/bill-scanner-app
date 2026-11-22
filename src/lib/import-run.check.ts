// Self-check for import undo's pure part: `npx tsx src/lib/import-run.check.ts`
import assert from "node:assert/strict";
import { restoreKey } from "@/lib/import-run";

assert.deepEqual(restoreKey({ a: "new", b: "x" }, "a", "old", "new"), { a: "old", b: "x" }); // put back
assert.deepEqual(restoreKey({ a: "new" }, "a", null, "new"), {}); // was empty -> removed again
assert.equal(restoreKey({ a: "changed since" }, "a", "old", "new"), null); // edited after the import -> left alone
assert.equal(restoreKey(null, "a", "old", "new"), null);
console.log("import-run ok");
export {};
