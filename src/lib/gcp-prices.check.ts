// Self-check: npx tsx src/lib/gcp-prices.check.ts
import assert from "node:assert/strict";
import { aiCostUsd, parsePrices, storageCostUsd } from "@/lib/gcp-prices";

const p = { models: { "gemini-2.5-pro": { input: 1.25, output: 10 } }, gcsGbMonth: 0.023 };
// 2 000 in, 300 out, 1 700 thinking: 2000×1.25/1e6 + 2000×10/1e6 = 0.0225
assert.equal(aiCostUsd(p, "gemini-2.5-pro", { input: 2000, output: 300, thinking: 1700 }), 0.0225);
assert.equal(aiCostUsd(p, "other", { input: 1, output: 1, thinking: 0 }), null);
assert.equal(aiCostUsd({ models: { m: { input: 1, output: null } }, gcsGbMonth: null }, "m", { input: 1, output: 1, thinking: 0 }), null);
assert.equal(storageCostUsd(p, 2 ** 30), 0.023);
assert.equal(storageCostUsd({ ...p, gcsGbMonth: null }, 1), null);
assert.deepEqual(parsePrices({ models: { "gemini-2.5-pro": { input: 1.25, output: "" } }, gcsGbMonth: null }), { models: { "gemini-2.5-pro": { input: 1.25, output: null } }, gcsGbMonth: null });
assert.equal(parsePrices({ models: { "x y": { input: 1, output: 1 } }, gcsGbMonth: 1 }), null);
assert.equal(parsePrices({ models: {}, gcsGbMonth: -1 }), null);
console.log("ok");
