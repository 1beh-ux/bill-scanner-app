// Self-check for the parent portal rules (no DB). npx tsx scripts/test-registration-portal.ts
import assert from "node:assert/strict";
import { isEligible, readEligibility, pushPatch, gateThrottle, afterGateFailure, birthDateMatches, portalAccessOf, profileValues, GATE_MAX_FAILURES } from "../src/lib/portal-rules";
import { newPortalToken, gateCookieValue, gateCookieValid } from "../src/lib/portal-gate";

// Eligibility: everyone / listed / all set criteria must match / empty = nobody.
const kid = { childId: "c1", birthYear: 2014, group: "Vlčata", attendedEventIds: new Set(["m2026"]) };
assert.equal(isEligible(null, kid), false);
assert.equal(isEligible({}, kid), false, "empty rule = nobody");
assert.equal(isEligible({ everyone: true }, kid), true);
assert.equal(isEligible({ childIds: ["c1"], birthYearFrom: 2020 }, kid), true, "listed child wins over criteria");
assert.equal(isEligible({ birthYearFrom: 2012, birthYearTo: 2015 }, kid), true);
assert.equal(isEligible({ birthYearFrom: 2015 }, kid), false);
assert.equal(isEligible({ birthYearTo: 2013 }, kid), false);
assert.equal(isEligible({ birthYearFrom: 2010 }, { ...kid, birthYear: null }), false, "no birth date fails a year criterion");
assert.equal(isEligible({ groups: ["Vlčata"], attendedEventIds: ["m2026"] }, kid), true);
assert.equal(isEligible({ groups: ["Skauti"], attendedEventIds: ["m2026"] }, kid), false, "every set criterion must match");
assert.equal(isEligible({ attendedEventIds: ["other"] }, kid), false);
assert.equal(isEligible({ groups: ["Vlčata"] }, { ...kid, group: null }), false);
assert.deepEqual(readEligibility({ everyone: false, birthYearFrom: "2010", groups: ["A", "A", "", 3], childIds: [] }), { groups: ["A"] }, "malformed parts dropped");
assert.deepEqual(readEligibility("nonsense"), {});

// Push: only keys the event has; built-ins to the participant's columns.
assert.deepEqual(pushPatch({ participant_first_name: "Jana", datum_narozeni: "2014-05-01", alergie: "pyl", tricko: "M" }, ["participant_first_name", "alergie", "Name"]), {
  firstName: "Jana",
  custom: { alergie: "pyl" },
});
assert.deepEqual(pushPatch({ alergie: "" }, ["alergie"]), { custom: { alergie: "" } }, "clearing a value is pushed too");
assert.deepEqual(pushPatch({ alergie: "x" }, []), { custom: {} });

// Portal access: built-ins need approval, org fields per template, unknown hidden.
const access = new Map([["alergie", "edit" as const]]);
assert.equal(portalAccessOf("datum_narozeni", access), "approval");
assert.equal(portalAccessOf("alergie", access), "edit");
assert.equal(portalAccessOf("pojistovna", access), "hidden");
assert.deepEqual(profileValues({ firstName: "Jan", lastName: null, dateOfBirth: new Date("2014-05-01"), fieldValues: { alergie: "pyl", bad: 3 } }), {
  alergie: "pyl",
  participant_first_name: "Jan",
  participant_last_name: "",
  datum_narozeni: "2014-05-01",
});

// Gate throttle: 10 wrong per hour, then blocked; an old window starts over.
const t0 = new Date("2026-10-04T10:00:00Z");
let s = { failures: 0, windowStart: null as Date | null };
for (let i = 0; i < GATE_MAX_FAILURES; i++) s = afterGateFailure(s, t0);
assert.equal(s.failures, GATE_MAX_FAILURES);
assert.equal(gateThrottle(s, new Date("2026-10-04T10:59:00Z")).blocked, true);
assert.equal(gateThrottle(s, new Date("2026-10-04T11:00:01Z")).blocked, false, "window over");
assert.deepEqual(afterGateFailure(s, new Date("2026-10-04T12:00:00Z")), { failures: 1, windowStart: new Date("2026-10-04T12:00:00Z") });
assert.equal(birthDateMatches("2014-05-01", new Date("2014-05-01")), true);
assert.equal(birthDateMatches("2014-05-02", new Date("2014-05-01")), false);
assert.equal(birthDateMatches("2014-05-01", null), false, "no birth date on file never passes");
assert.equal(birthDateMatches(undefined, new Date("2014-05-01")), false);

// Token: 32+ random chars, URL-safe, never repeats.
const tokens = new Set(Array.from({ length: 200 }, newPortalToken));
assert.equal(tokens.size, 200);
for (const tk of tokens) assert.match(tk, /^[A-Za-z0-9_-]{43}$/);

// Gate cookie: HMAC of child id + CURRENT token -- a new token invalidates it.
const secret = "test-secret-0123456789";
const cookie = gateCookieValue("c1", "tokenA", secret);
assert.equal(gateCookieValid(cookie, "c1", "tokenA", secret), true);
assert.equal(gateCookieValid(cookie, "c1", "tokenB", secret), false, "regenerated token kills old devices");
assert.equal(gateCookieValid(cookie, "c2", "tokenA", secret), false);
assert.equal(gateCookieValid(cookie, "c1", "tokenA", "other-secret-0123456"), false);
assert.equal(gateCookieValid(undefined, "c1", "tokenA", secret), false);
assert.equal(gateCookieValid(cookie.slice(1), "c1", "tokenA", secret), false);

console.log("ok");
