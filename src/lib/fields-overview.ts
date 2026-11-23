// Fields Manager overview (phase 2, docs/fields-manager-design/design.md §2): sources -> fields -> uses for one
// event, built from rows the API has already loaded. Pure, so fields-overview.check.ts runs without a database.
import { calcDeps, readCalcSpec } from "@/lib/field-calc";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";

export type OvTemplate = {
  key: string;
  label: string;
  fieldType: string;
  portalAccess: string;
  requiredInRegistration: boolean;
  level: string;
  audience: string;
  profileSection: string | null;
  storage: string;
  section: string | null;
  active: boolean;
};
export type OvEventField = {
  key: string;
  label: string;
  fieldType: string;
  kind: string;
  computedType: string | null;
  options: unknown;
  surfaces: string[];
  active: boolean;
  requiredOnRegistration: boolean;
  sortOrder: number | null;
};
export type OvSync = { id: string; name: string; autoSync: boolean; everyHours: number; mapping: Record<string, string> };

export type UseId = "lists" | "health" | "mail" | "email" | "documents" | "portal" | "form";
export const USE_IDS: UseId[] = ["lists", "health", "mail", "email", "documents", "portal", "form"];

export type OvField = {
  key: string;
  label: string;
  fieldType: string;
  kind: string;
  group: string;
  /** Where values live: profile (+ registration copy), event (registration only), fixed (built-in), guardian, calculated. */
  storage: "profile" | "event" | "fixed" | "guardian" | "calculated";
  calculated: boolean;
  deps: string[];
  surfaces: string[];
  active: boolean;
  required: boolean;
  requiredDefault: boolean | null;
  portalAccess: string | null;
  level: string | null;
  fromTemplate: boolean;
  aliases: string[];
  values: { profiles: number; registrations: number };
  sources: string[];
  uses: UseId[];
  /** Redesign R7/R9: the calculated spec / the contact rule, edited in the panel. */
  options: unknown;
  computedType: string | null;
};
export type OvGroup = { id: string; label: string | null; labelKey: string | null };
export type OvSource = { id: string; kind: "sync" | "form" | "portal"; label: string | null; labelKey: string | null; autoSync?: boolean; everyHours?: number };
export type Overview = { groups: OvGroup[]; fields: OvField[]; sources: OvSource[]; uses: UseId[] };

const USE_BY_SURFACE: Record<string, UseId> = { list: "lists", health_list: "health", health_detail: "health", mail_list: "mail", email: "email", documents: "documents" };

/** Non-empty values per key across a list of stored maps. */
export function countValues(maps: (Record<string, unknown> | null | undefined)[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) {
    for (const [k, v] of Object.entries(m ?? {})) {
      if (typeof v === "string" ? v.trim() !== "" : v != null && v !== false) out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

export function buildOverview(input: {
  templates: OvTemplate[];
  eventFields: OvEventField[];
  syncs: OvSync[];
  aliases: { alias: string; targetKey: string }[];
  profileSections: { key: string; label: string }[];
  profileCounts: Map<string, number>;
  registrationCounts: Map<string, number>;
  publicRegistration: boolean;
}): Overview {
  const tpl = new Map(input.templates.map((t) => [t.key, t]));
  const aliasesOf = new Map<string, string[]>();
  for (const a of input.aliases) aliasesOf.set(a.targetKey, [...(aliasesOf.get(a.targetKey) ?? []), a.alias]);
  const canonical = (k: string) => input.aliases.find((a) => a.alias === k)?.targetKey ?? k;
  const sectionLabel = new Map(input.profileSections.map((s) => [s.key, s.label]));

  // Sources: saved sheet connections (by their mapping targets), the public form, the parent portal.
  const sources: OvSource[] = input.syncs.map((s) => ({ id: `sync:${s.id}`, kind: "sync", label: s.name, labelKey: null, autoSync: s.autoSync, everyHours: s.everyHours }));
  const syncTargets = new Map<string, string[]>();
  for (const s of input.syncs) {
    // Two columns of one connection may feed the same field (directly and through an alias): count it once.
    for (const k of new Set(Object.values(s.mapping).map(canonical))) {
      syncTargets.set(k, [...(syncTargets.get(k) ?? []), `sync:${s.id}`]);
    }
  }

  const fields: OvField[] = [];
  const ordered = [...input.eventFields].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.label.localeCompare(b.label, "cs"));
  for (const f of ordered) {
    const t = f.kind === "custom" ? tpl.get(f.key) : undefined;
    const spec = readCalcSpec(f.fieldType, f.options);
    const calculated = f.kind === "computed" || !!spec;
    const fixed = FIXED_PARTICIPANT_FIELDS.some((d) => d.key === f.key) && f.kind !== "custom";
    const storage: OvField["storage"] = calculated ? "calculated" : f.kind === "guardian" ? "guardian" : fixed ? "fixed" : t ? (t.storage === "event" ? "event" : "profile") : "event";
    const group = calculated
      ? "calculated"
      : f.kind === "guardian"
        ? "guardians"
        : fixed
          ? "basic"
          : t
            ? t.section || (t.profileSection && sectionLabel.has(t.profileSection) ? `section:${t.profileSection}` : t.level === "detailed" ? "detailed" : "basic")
            : "event";
    const portal = !!t && t.portalAccess !== "hidden";
    const asked = f.kind === "custom" && f.requiredOnRegistration && (!t || t.portalAccess === "edit" || t.portalAccess === "approval");
    const uses = new Set<UseId>(f.surfaces.map((s) => USE_BY_SURFACE[s]).filter((u): u is UseId => !!u));
    if (portal) uses.add("portal");
    if (asked) uses.add("form");
    const src = [...(syncTargets.get(f.key) ?? [])];
    if (asked && input.publicRegistration) src.push("form");
    if (t && (t.portalAccess === "edit" || t.portalAccess === "approval")) src.push("portal");
    fields.push({
      key: f.key,
      label: f.label,
      fieldType: f.fieldType,
      kind: f.kind,
      group,
      storage,
      calculated,
      deps: spec ? calcDeps(spec) : [],
      surfaces: f.surfaces,
      active: f.active,
      required: f.requiredOnRegistration,
      requiredDefault: t ? t.requiredInRegistration : null,
      portalAccess: t ? t.portalAccess : null,
      level: t ? t.level : null,
      fromTemplate: !!t,
      aliases: aliasesOf.get(f.key) ?? [],
      values: { profiles: input.profileCounts.get(f.key) ?? 0, registrations: input.registrationCounts.get(f.key) ?? 0 },
      sources: src,
      uses: USE_IDS.filter((u) => uses.has(u)),
      options: f.options ?? null,
      computedType: f.computedType,
    });
  }

  if (input.publicRegistration) sources.push({ id: "form", kind: "form", label: null, labelKey: "fieldsManager.sourceForm" });
  if (fields.some((f) => f.sources.includes("portal"))) sources.push({ id: "portal", kind: "portal", label: null, labelKey: "fieldsManager.sourcePortal" });

  // Groups in a fixed order; custom profile sections in the organization's order; empty groups dropped.
  const groupOrder: OvGroup[] = [
    { id: "basic", label: null, labelKey: "fieldsManager.groupBasic" },
    { id: "detailed", label: null, labelKey: "fieldsManager.groupDetailed" },
    ...input.profileSections.map((s) => ({ id: `section:${s.key}`, label: s.label, labelKey: null })),
    { id: "event", label: null, labelKey: "fieldsManager.groupEvent" },
    { id: "guardians", label: null, labelKey: "fieldsManager.groupGuardians" },
    { id: "calculated", label: null, labelKey: "fieldsManager.groupCalculated" },
  ];
  const known = new Set(groupOrder.map((g) => g.id));
  for (const f of fields) if (!known.has(f.group)) { groupOrder.push({ id: f.group, label: f.group, labelKey: null }); known.add(f.group); }
  const used = new Set(fields.map((f) => f.group));
  return { groups: groupOrder.filter((g) => used.has(g.id)), fields, sources, uses: USE_IDS };
}
