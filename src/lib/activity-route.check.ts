// Self-check: npx tsx src/lib/activity-route.check.ts
import assert from "node:assert/strict";
import { cleanRoute, routeModule, routePattern } from "@/lib/activity-route";

const id = "3f2b8c1e-0a4d-4e7b-9c55-1d2e3f4a5b6c";
assert.equal(routePattern(`/events/${id}/bills/abc123`, { id, billId: "abc123" }), "/events/[id]/bills/[billId]");
assert.equal(routePattern("/events", {}), "/events");
assert.equal(cleanRoute(`/events/[id]/bills/${id}`), "/events/[id]/bills/[id]"); // a leaked id
assert.equal(cleanRoute("/users?x=1"), "/users");
assert.equal(cleanRoute("/"), "/");
assert.equal(cleanRoute("/r/[slug]"), null);
assert.equal(cleanRoute("/login"), null);
assert.equal(cleanRoute("/x/<script>"), null);
assert.equal(cleanRoute("users"), null);
assert.equal(routeModule("/events/[id]/budget"), "bills");
assert.equal(routeModule("/events/[id]"), "event-settings");
assert.equal(routeModule("/authors"), "authors");
assert.equal(routeModule("/"), "home");
console.log("ok");
