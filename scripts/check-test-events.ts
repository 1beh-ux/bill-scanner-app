// Test events stay out of Lidé and cross-event lists (audit 2026-11-05, Event.isTest): a static check that each
// query keeps its filter (scripts/test-org-isolation.ts proves the behaviour on a DB). npx tsx scripts/check-test-events.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const must: [string, RegExp, string][] = [
  ["src/lib/children.ts", /event: NOT_TEST_EVENT \}\] \}/, "linkChildren never links a test event's participants"],
  ["src/lib/children.ts", /where: \{ childId, event: NOT_TEST_EVENT \}/, "profile fill never copies from a test event"],
  ["src/app/api/children/route.ts", /peopleLinkMode: "all", isTest: false/, "Lidé's unlinked list leaves test events out"],
  ["src/lib/portal-server.ts", /isTest: false/, "the family portal never offers a test event"],
  ["src/app/api/events/[id]/kitchen/copy/route.ts", /isTest: false/, "kitchen copy-from picker"],
  ["src/app/api/events/[id]/portal-eligibility/route.ts", /isTest: false/, "eligibility event picker"],
  ["src/app/api/organizations/portal-settings/route.ts", /isTest: false/, "portal 'join' event list"],
  ["src/app/api/public-hosts/route.ts", /isTest: false/, "public host event list"],
  ["src/lib/usage-queries.ts", /AND NOT e\.is_test LEFT JOIN ai_usage/, "Využití organization totals (AI)"],
  ["src/lib/usage-queries.ts", /storageBy\("org_id", Prisma\.sql`AND NOT is_test`\)/, "Využití organization totals (storage)"],
];
for (const [file, re, what] of must) assert.match(readFileSync(file, "utf8"), re, `${what}: ${file}`);
console.log(`check-test-events: all passed (${must.length} queries)`);
