// U4: 6 rapid module toggles with random server latency are applied in click order and none is lost.
// npx tsx scripts/check-serial-queue.ts
import assert from "node:assert/strict";
import { serialQueue } from "../src/lib/serial-queue";

(async () => {
  const server = new Map<string, boolean>();
  const order: string[] = [];
  let inFlight = 0;
  const patch = async (key: string, enabled: boolean) => {
    inFlight++;
    assert.equal(inFlight, 1, "two PATCHes in flight at once");
    await new Promise((ok) => setTimeout(ok, Math.random() * 20));
    order.push(`${key}=${enabled}`);
    server.set(key, enabled);
    inFlight--;
    if (key === "fail") throw new Error("500");
  };
  const enqueue = serialQueue();
  const clicks: [string, boolean][] = [["bills", true], ["health", true], ["bills", false], ["fail", true], ["mail", true], ["bills", true]];
  const results = await Promise.allSettled(clicks.map(([k, v]) => enqueue(() => patch(k, v))));
  assert.deepEqual(order, clicks.map(([k, v]) => `${k}=${v}`), "applied in click order");
  assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled", "fulfilled", "rejected", "fulfilled", "fulfilled"], "a failure doesn't block later toggles");
  assert.deepEqual(Object.fromEntries(server), { bills: true, health: true, fail: true, mail: true });
  console.log("check-serial-queue: all passed");
})();
