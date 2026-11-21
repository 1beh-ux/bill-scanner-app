// Self-check for decision A: `npx tsx src/lib/field-write-targets.check.ts` (invented keys and values)
import assert from "node:assert/strict";
import { writeTargets } from "@/lib/field-write-targets";
import { routeAnswers, type AskedField } from "@/lib/registration-fields";

// The rules.
assert.deepEqual(writeTargets({ fromTemplate: false }, { source: "portal" }), { registration: true, profile: "no" });
assert.deepEqual(writeTargets({ fromTemplate: false }, { source: "import" }), { registration: true, profile: "no" });
assert.deepEqual(writeTargets({ fromTemplate: true, storage: "event", portalAccess: "edit" }, { source: "portal" }), { registration: true, profile: "no" });
assert.deepEqual(writeTargets({ fromTemplate: true, storage: "event" }, { source: "admin" }), { registration: true, profile: "no" });
assert.deepEqual(writeTargets({ fromTemplate: true, storage: "profile" }, { source: "import" }), { registration: true, profile: "write" });
assert.deepEqual(writeTargets({ fromTemplate: true }, { source: "admin" }), { registration: true, profile: "write" });
assert.deepEqual(writeTargets({ fromTemplate: true }, { source: "import", override: "registration_only" }), { registration: true, profile: "no" });
assert.deepEqual(writeTargets({ fromTemplate: true, portalAccess: "edit" }, { source: "portal" }), { registration: true, profile: "write" });
assert.deepEqual(writeTargets({ fromTemplate: true, portalAccess: "approval" }, { source: "portal" }), { registration: true, profile: "propose" });
assert.deepEqual(writeTargets({ fromTemplate: true, portalAccess: "read" }, { source: "portal" }), { registration: true, profile: "no" });

// routeAnswers through writeTargets == the old inline rule, for every field today (no storage set).
function oldRoute(asked: AskedField[], values: Record<string, string>, live: Record<string, string>, shown: Record<string, string>) {
  const out = { participant: { ...values }, profile: {} as Record<string, string>, proposals: [] as { key: string; oldValue: string; newValue: string }[] };
  for (const f of asked) {
    const v = values[f.key];
    if (v === undefined || f.source !== "profile") continue;
    if (f.access === "edit" && v !== (live[f.key] ?? "")) out.profile[f.key] = v;
    if (f.access === "approval" && v !== (shown[f.key] ?? live[f.key] ?? "")) out.proposals.push({ key: f.key, oldValue: live[f.key] ?? "", newValue: v });
  }
  return out;
}
const F = (key: string, source: "profile" | "event", access: "edit" | "approval" | null): AskedField => ({ key, label: key, fieldType: "text", options: null, source, access, level: "basic", audience: "both" });
const asked = [F("a", "profile", "edit"), F("b", "profile", "approval"), F("c", "event", null), F("d", "profile", "edit"), F("e", "profile", "approval")];
const sets: Record<string, string>[] = [{ a: "1", b: "2", c: "3", d: "x", e: "y" }, { a: "", b: "" }, {}];
for (const values of sets) {
  for (const live of [{ a: "1", d: "old", e: "y" }, {}] as Record<string, string>[]) {
    for (const shown of [{ b: "2" }, {}] as Record<string, string>[]) assert.deepEqual(routeAnswers(asked, values, live, shown), oldRoute(asked, values, live, shown));
  }
}
// New: a template stored on the registration only never touches the profile.
const ev = { ...F("tricko", "profile", "edit"), storage: "event" };
assert.deepEqual(routeAnswers([ev], { tricko: "M" }, {}, {}).profile, {});
assert.deepEqual(routeAnswers([ev], { tricko: "M" }, {}, {}).participant, { tricko: "M" });

console.log("field-write-targets: ok");
