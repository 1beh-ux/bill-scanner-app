// Self-check: CC addresses and export schedules (2026-11-27). npx tsx src/lib/automation.check.ts
import assert from "node:assert/strict";
import { ccAddresses, readCcRule, readEmailCc } from "@/lib/email-cc";
import { isDue } from "@/lib/sheet-export";

const rule = readCcRule({ fieldKey: "oddil", map: { Dráčci: "a@example.invalid, b@example.invalid; spatne", Teetové: "" } })!;
assert.deepEqual(ccAddresses(rule, { oddil: "Dráčci" }), ["a@example.invalid", "b@example.invalid"]);
assert.deepEqual(ccAddresses(rule, { oddil: "Teetové" }), []);
assert.deepEqual(ccAddresses(rule, {}), []);
assert.deepEqual(ccAddresses(null, { oddil: "Dráčci" }), []);
assert.equal(readCcRule({ map: {} }), null);
assert.ok(rule.noticeSubject.includes("{{original_subject}}"));
assert.deepEqual(readEmailCc({ a: "copy", b: "notice", c: "x" }), { a: "copy", b: "notice" });

// Every 6 hours: due after 6 h (a minute of slack), not before; never run = due.
const t0 = new Date("2026-11-27T08:00:00Z");
assert.equal(isDue({ everyHours: 6, dailyAt: null, lastRunAt: null }, t0), true);
assert.equal(isDue({ everyHours: 6, dailyAt: null, lastRunAt: t0 }, new Date("2026-11-27T13:00:00Z")), false);
assert.equal(isDue({ everyHours: 6, dailyAt: null, lastRunAt: t0 }, new Date("2026-11-27T13:59:30Z")), true);
// Daily at 06:00 Prague (= 05:00 UTC in winter): not before, once after, again the next day.
assert.equal(isDue({ everyHours: null, dailyAt: "06:00", lastRunAt: null }, new Date("2026-11-27T04:59:00Z")), false);
assert.equal(isDue({ everyHours: null, dailyAt: "06:00", lastRunAt: null }, new Date("2026-11-27T05:01:00Z")), true);
assert.equal(isDue({ everyHours: null, dailyAt: "06:00", lastRunAt: new Date("2026-11-27T05:01:00Z") }, new Date("2026-11-27T18:00:00Z")), false);
assert.equal(isDue({ everyHours: null, dailyAt: "06:00", lastRunAt: new Date("2026-11-27T05:01:00Z") }, new Date("2026-11-28T05:02:00Z")), true);
console.log("automation ok");
