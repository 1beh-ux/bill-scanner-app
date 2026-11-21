// Self-check for the per-organization feature flags: `npx tsx src/lib/org-features.check.ts`
import assert from "node:assert/strict";
import { featureOn, guardianSlots, isFeature, withFeature } from "@/lib/org-features";

// Off unless stored -- the default for every organization.
assert.equal(featureOn([], "fields_manager"), false);
assert.equal(featureOn(null, "fields_manager"), false);
assert.equal(featureOn(undefined, "fields_manager"), false);
assert.equal(featureOn(["something_else"], "fields_manager"), false);
assert.equal(featureOn(["fields_manager"], "fields_manager"), true);

// Switching: idempotent, drops unknown entries, no duplicates.
assert.deepEqual(withFeature([], "fields_manager", true), ["fields_manager"]);
assert.deepEqual(withFeature(["fields_manager"], "fields_manager", true), ["fields_manager"]);
assert.deepEqual(withFeature(["fields_manager", "junk"], "fields_manager", false), []);
assert.deepEqual(withFeature(["junk"], "fields_manager", true), ["fields_manager"]);
assert.deepEqual(withFeature(null, "fields_manager", false), []);

assert.equal(isFeature("fields_manager"), true);
assert.equal(isFeature("FIELDS_MANAGER"), false);
assert.equal(isFeature(42), false);

// Guardian slots: 1..6, default 2.
assert.equal(guardianSlots(2), 2);
assert.equal(guardianSlots(6), 6);
assert.equal(guardianSlots(7), 6);
assert.equal(guardianSlots(0), 1);
assert.equal(guardianSlots(-3), 1);
assert.equal(guardianSlots(3.7), 3);
assert.equal(guardianSlots(null), 2);
assert.equal(guardianSlots(undefined), 2);
assert.equal(guardianSlots(Number.NaN), 2);

console.log("org-features: ok");
