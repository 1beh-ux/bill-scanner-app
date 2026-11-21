// Self-check for the Fields Manager overview graph: `npx tsx src/lib/fields-overview.check.ts` (invented fields only)
import assert from "node:assert/strict";
import { buildOverview, countValues, type OvEventField, type OvTemplate } from "@/lib/fields-overview";

const T = (key: string, extra: Partial<OvTemplate> = {}): OvTemplate => ({
  key, label: key, fieldType: "text", portalAccess: "edit", requiredInRegistration: false, level: "basic", audience: "both", profileSection: null, storage: "profile", section: null, active: true, ...extra,
});
const E = (key: string, extra: Partial<OvEventField> = {}): OvEventField => ({
  key, label: key, fieldType: "text", kind: "custom", computedType: null, options: null, surfaces: ["list"], active: true, requiredOnRegistration: false, sortOrder: null, ...extra,
});

const ov = buildOverview({
  templates: [
    T("pojistovna", { requiredInRegistration: true }),
    T("velikost_trika", { storage: "event", level: "detailed" }),
    T("alergie_x", { profileSection: "szdravi", level: "detailed" }),
    T("skryte", { portalAccess: "hidden" }),
  ],
  eventFields: [
    E("Name", { kind: "builtin", surfaces: ["list", "documents"] }),
    E("zast_jmeno", { kind: "guardian", surfaces: ["documents"] }),
    E("Email", { kind: "computed", computedType: "contact_email", surfaces: ["list", "mail_list"] }),
    E("pojistovna", { surfaces: ["list", "documents"], requiredOnRegistration: true }),
    E("velikost_trika", { surfaces: ["documents"] }),
    E("alergie_x", { surfaces: ["health_list", "health_detail"] }),
    E("skryte", { requiredOnRegistration: true }),
    E("poznamka_akce", { requiredOnRegistration: true, surfaces: ["email"] }),
    E("adresa", { fieldType: "composite", options: { parts: ["ulice", "mesto"], separator: ", " }, surfaces: ["documents"] }),
  ],
  syncs: [{ id: "s1", name: "Registrace", autoSync: true, everyHours: 1, mapping: { "Jméno": "Name", "Pojišťovna": "pojistovna", Stará: "stara_pojistovna", "Zástupce": "zast_jmeno" } }],
  aliases: [{ alias: "stara_pojistovna", targetKey: "pojistovna" }],
  profileSections: [{ key: "szdravi", label: "Zdravotní údaje" }],
  profileCounts: countValues([{ pojistovna: "111" }, { pojistovna: "", alergie_x: "pyl" }, null]),
  registrationCounts: countValues([{ pojistovna: "111", poznamka_akce: "x" }]),
  publicRegistration: true,
});

const f = (k: string) => ov.fields.find((x) => x.key === k)!;
// Storage and groups.
assert.equal(f("Name").storage, "fixed");
assert.equal(f("Name").group, "basic");
assert.equal(f("zast_jmeno").storage, "guardian");
assert.equal(f("zast_jmeno").group, "guardians");
assert.equal(f("Email").calculated, true);
assert.equal(f("Email").group, "calculated");
assert.equal(f("adresa").calculated, true);
assert.deepEqual(f("adresa").deps, ["ulice", "mesto"]);
assert.equal(f("pojistovna").storage, "profile");
assert.equal(f("velikost_trika").storage, "event");
assert.equal(f("velikost_trika").group, "detailed");
assert.equal(f("alergie_x").group, "section:szdravi");
assert.equal(f("poznamka_akce").storage, "event");
assert.equal(f("poznamka_akce").group, "event");
// Required: event value + organization default.
assert.equal(f("pojistovna").required, true);
assert.equal(f("pojistovna").requiredDefault, true);
assert.equal(f("poznamka_akce").requiredDefault, null);
// Uses.
assert.deepEqual(f("pojistovna").uses, ["lists", "documents", "portal", "form"]);
assert.deepEqual(f("alergie_x").uses, ["health", "portal"]);
assert.deepEqual(f("skryte").uses, ["lists"]); // hidden from parents: not asked, not in the portal
assert.deepEqual(f("poznamka_akce").uses, ["email", "form"]); // event-only question is asked of everyone
// Sources: the sync (also via an alias), the form, the portal.
assert.deepEqual(f("pojistovna").sources, ["sync:s1", "form", "portal"]);
assert.deepEqual(f("Name").sources, ["sync:s1"]);
assert.deepEqual(f("zast_jmeno").sources, ["sync:s1"]);
assert.deepEqual(f("skryte").sources, []);
assert.deepEqual(ov.sources.map((s) => s.id), ["sync:s1", "form", "portal"]);
// Aliases and value counts.
assert.deepEqual(f("pojistovna").aliases, ["stara_pojistovna"]);
assert.deepEqual(f("pojistovna").values, { profiles: 1, registrations: 1 });
assert.deepEqual(f("alergie_x").values, { profiles: 1, registrations: 0 });
// Groups: fixed order, only used ones.
assert.deepEqual(ov.groups.map((g) => g.id), ["basic", "detailed", "section:szdravi", "event", "guardians", "calculated"]);
assert.equal(ov.groups.find((g) => g.id === "section:szdravi")!.label, "Zdravotní údaje");
// No public form: no form source, but the event's asked fields still "use" the registration.
const noForm = buildOverview({ templates: [], eventFields: [E("q", { requiredOnRegistration: true })], syncs: [], aliases: [], profileSections: [], profileCounts: new Map(), registrationCounts: new Map(), publicRegistration: false });
assert.deepEqual(noForm.sources, []);
assert.deepEqual(noForm.fields[0].sources, []);

console.log("fields-overview: ok");
