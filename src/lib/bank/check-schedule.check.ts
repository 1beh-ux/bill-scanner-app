// Self-check: npx tsx src/lib/bank/check-schedule.check.ts
import assert from "node:assert/strict";
import { accountDue, intervalOf } from "@/lib/bank/check-schedule";

const now = new Date("2026-10-23T12:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);
assert.equal(accountDue(null, [30], now), true);
assert.equal(accountDue(ago(50), [1], now), true); // 1 min, cron 10 s early
assert.equal(accountDue(ago(30), [1], now), false);
assert.equal(accountDue(ago(10 * 60), [30], now), false);
assert.equal(accountDue(ago(10 * 60), [30, 5], now), true); // the most frequent event decides
assert.equal(accountDue(ago(29 * 60 + 50), [null], now), true); // default 30
assert.equal(intervalOf(7), 30); // not an option -> default
console.log("check schedule ok");
