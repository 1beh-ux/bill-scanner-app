// Self-check for src/lib/request-security.ts (+ hashedIp): npx tsx scripts/check-request-security.ts
import assert from "node:assert/strict";
import { clientIp, secretMatches } from "../src/lib/request-security";
import { hashedIp } from "../src/lib/portal-rate";

const LB = "34.144.251.105"; // tabornik.online's load balancer
const req = (host: string, xff: string) => new Request(`https://${host}/api/public/r/x`, { headers: { host, "x-forwarded-for": xff } });

// Through the load balancer: "<spoofed…>, <client>, <lb>" -> the client, whatever the caller prepended.
assert.equal(clientIp(req("tabornik.online", `203.0.113.7, ${LB}`).headers), "203.0.113.7");
assert.equal(clientIp(req("tabornik.online", `1.1.1.1, 203.0.113.7, ${LB}`).headers), "203.0.113.7");
assert.equal(clientIp(req("prihlasky.zare.cz", `9.9.9.9, 8.8.8.8, 203.0.113.7, ${LB}`).headers), "203.0.113.7");
// Two different spoofed first hops from the same real client share one rate-limit bucket.
assert.equal(hashedIp(req("tabornik.online", `1.1.1.1, 203.0.113.7, ${LB}`)), hashedIp(req("tabornik.online", `6.6.6.6, 203.0.113.7, ${LB}`)));
// …and two real clients don't.
assert.notEqual(hashedIp(req("tabornik.online", `198.51.100.1, ${LB}`)), hashedIp(req("tabornik.online", `198.51.100.2, ${LB}`)));
// Directly on run.app: Cloud Run's front end appends just the client.
const runApp = "bill-scanner-app-1050716617948.europe-west3.run.app";
assert.equal(clientIp(req(runApp, "203.0.113.7").headers), "203.0.113.7");
assert.equal(clientIp(req(runApp, "1.1.1.1, 203.0.113.7").headers), "203.0.113.7");
assert.equal(hashedIp(req(runApp, "1.1.1.1, 203.0.113.7")), hashedIp(req(runApp, "6.6.6.6, 203.0.113.7")));
// Local / no header.
assert.equal(clientIp(new Request("http://localhost:3000/", { headers: { host: "localhost:3000" } }).headers), "unknown");

// Constant-time secret comparison.
assert.equal(secretMatches("abc", "abc"), true);
assert.equal(secretMatches("abd", "abc"), false);
assert.equal(secretMatches("abcd", "abc"), false);
assert.equal(secretMatches(null, "abc"), false);
assert.equal(secretMatches("abc", undefined), false);
assert.equal(secretMatches("", ""), false);
console.log("check-request-security: all passed");
