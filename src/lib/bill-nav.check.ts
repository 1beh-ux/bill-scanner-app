// Self-check: npx tsx src/lib/bill-nav.check.ts
import assert from "node:assert/strict";
const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
const { adjacentInList, readListFilters, saveListFilters, saveListOrder } = await import("@/lib/bill-nav");

saveListOrder("e1", ["a", "b", "c"]);
assert.deepEqual(adjacentInList("e1", "a"), { prev: null, next: "b" });
assert.deepEqual(adjacentInList("e1", "b"), { prev: "a", next: "c" });
assert.deepEqual(adjacentInList("e1", "c"), { prev: "b", next: null });
assert.equal(adjacentInList("e1", "x"), null); // not in the list shown -> caller falls back
assert.equal(adjacentInList("e2", "a"), null); // other event
saveListFilters("e1", { status: "to_review", paid: null, search: "lidl", columns: { payer: ["Akce"] } });
assert.deepEqual(readListFilters("e1")?.columns, { payer: ["Akce"] });
(globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
assert.equal(adjacentInList("e1", "a"), null); // storage blocked -> no crash
saveListOrder("e1", ["a"]);
console.log("ok");
