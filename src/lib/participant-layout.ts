// Layout of the participant detail and the Zdraví participant detail (the
// in-place "Upravit rozvržení" editor). Stored per event as
// Event.participantLayout = { detail?, health? }; null/missing = the built-in
// layout, which reproduces the pages as they were before the editor existed.
// Prisma-free: both pages and the API use it.
import type { HealthNoteConfig, HealthNotePlace } from "@/lib/health-notes";

export type DetailSectionKind = "basics" | "guardians" | "documents" | "fields" | "health";
export type HealthSectionKind = "notes" | "medsReported" | "medPlans" | "incidents" | "documents" | "guardians" | "emails";
export type SectionKind = DetailSectionKind | HealthSectionKind;
export type Column = "left" | "right";
export type Section = { id: string; kind: SectionKind; title?: string; column: Column; hidden?: boolean; fields?: string[] };
export type PageLayout = { sections: Section[]; hiddenFields?: string[] };
export type ParticipantLayout = { detail?: PageLayout; health?: PageLayout };
export type LayoutPage = "detail" | "health";

export type LayoutField = { key: string; kind: string; fieldType: string; surfaces: string[] };

const DETAIL_KINDS: DetailSectionKind[] = ["basics", "guardians", "documents", "fields", "health"];
export const HEALTH_KINDS: HealthSectionKind[] = ["notes", "documents", "guardians", "medsReported", "medPlans", "incidents", "emails"];
/** Always on the detail page, never hidden. */
export const FIXED_KINDS: SectionKind[] = ["basics", "guardians"];
export const NEW_NOTE_PLACES: HealthNotePlace[] = ["detail", "meds", "incident", "pdf"];

/** A custom field the detail page shows an input for (composite = computed, image = no input). */
export const isEditableField = (f: LayoutField) => f.kind === "custom" && f.fieldType !== "composite" && f.fieldType !== "image";

/**
 * Editable fields in the "Zdravotní poznámky" group: in the health config AND
 * carrying the health surfaces (saveHealthNotesConfig keeps both in sync; for a
 * never-saved config the surfaces are what the page always used).
 */
export function healthMembers(fields: LayoutField[], healthConfig: HealthNoteConfig[]): string[] {
  const inConfig = new Set(healthConfig.map((c) => c.fieldKey));
  return fields.filter((f) => isEditableField(f) && inConfig.has(f.key) && f.surfaces.some((s) => s === "health_list" || s === "health_detail")).map((f) => f.key);
}

/** The page as it was: basics + guardians left; documents, Údaje, Zdravotní poznámky right. `fields` in display (sortOrder) order. */
export function defaultDetailLayout(fields: LayoutField[], healthConfig: HealthNoteConfig[]): PageLayout {
  const members = new Set(healthMembers(fields, healthConfig));
  const editable = fields.filter(isEditableField).map((f) => f.key);
  return {
    sections: [
      { id: "basics", kind: "basics", column: "left" },
      { id: "guardians", kind: "guardians", column: "left" },
      { id: "documents", kind: "documents", column: "right" },
      { id: "fields", kind: "fields", column: "right", fields: editable.filter((k) => !members.has(k)) },
      { id: "health", kind: "health", column: "right", fields: editable.filter((k) => members.has(k)) },
    ],
    hiddenFields: [],
  };
}

export const defaultHealthLayout = (): PageLayout => ({ sections: HEALTH_KINDS.map((k) => ({ id: k, kind: k, column: "left" })) });

/** The saved detail layout made consistent with today's fields and health config (or the default). */
export function resolveDetailLayout(saved: PageLayout | null | undefined, fields: LayoutField[], healthConfig: HealthNoteConfig[]): PageLayout {
  const def = defaultDetailLayout(fields, healthConfig);
  if (!saved) return def;
  const editable = fields.filter(isEditableField).map((f) => f.key);
  const editableSet = new Set(editable);
  const memberList = healthMembers(fields, healthConfig);
  const members = new Set(memberList);
  const placed = new Set<string>();
  const ids = new Set<string>();
  const sections: Section[] = [];
  for (const s of saved.sections) {
    if (!DETAIL_KINDS.includes(s.kind as DetailSectionKind) || ids.has(s.id)) continue;
    if (s.kind !== "fields" && sections.some((x) => x.kind === s.kind)) continue;
    ids.add(s.id);
    const out: Section = { id: s.id, kind: s.kind, column: s.column === "left" ? "left" : "right" };
    if (s.hidden && !FIXED_KINDS.includes(s.kind)) out.hidden = true;
    if (s.kind === "fields") {
      if (s.title) out.title = s.title;
      out.fields = (s.fields ?? []).filter((k) => editableSet.has(k) && !members.has(k) && !placed.has(k));
      out.fields.forEach((k) => placed.add(k));
    }
    if (s.kind === "health") {
      const keep = (s.fields ?? []).filter((k) => members.has(k) && !placed.has(k));
      keep.forEach((k) => placed.add(k));
      out.fields = keep;
    }
    sections.push(out);
  }
  // Fixed sections back where the default has them.
  for (const d of def.sections) {
    if (d.kind !== "fields" && !sections.some((s) => s.kind === d.kind)) sections.push({ ...d, fields: d.kind === "health" ? [] : undefined });
  }
  const health = sections.find((s) => s.kind === "health")!;
  health.fields = [...health.fields!, ...memberList.filter((k) => !placed.has(k))];
  health.fields.forEach((k) => placed.add(k));
  const hiddenFields = (saved.hiddenFields ?? []).filter((k) => editableSet.has(k) && !placed.has(k));
  hiddenFields.forEach((k) => placed.add(k));
  const unplaced = editable.filter((k) => !placed.has(k));
  if (unplaced.length) {
    let target = sections.find((s) => s.kind === "fields");
    if (!target) {
      target = { id: "fields", kind: "fields", column: "right", fields: [] };
      sections.splice(sections.indexOf(health), 0, target);
    }
    target.fields = [...target.fields!, ...unplaced];
  }
  return { sections, hiddenFields };
}

export function resolveHealthLayout(saved: PageLayout | null | undefined): PageLayout {
  const sections: Section[] = [];
  for (const s of saved?.sections ?? []) {
    if (!HEALTH_KINDS.includes(s.kind as HealthSectionKind) || sections.some((x) => x.kind === s.kind)) continue;
    sections.push({ id: s.kind, kind: s.kind, column: "left", ...(s.hidden ? { hidden: true } : {}) });
  }
  for (const d of defaultHealthLayout().sections) if (!sections.some((s) => s.kind === d.kind)) sections.push(d);
  return { sections };
}

/** Untrusted layout -> well-formed one (kinds of that page, bounded strings/lists, known field keys). */
export function sanitizePageLayout(input: unknown, page: LayoutPage, fieldKeys: Set<string>): PageLayout | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { sections?: unknown; hiddenFields?: unknown };
  if (!Array.isArray(raw.sections)) return null;
  const kinds: string[] = page === "detail" ? DETAIL_KINDS : HEALTH_KINDS;
  const keys = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string" && fieldKeys.has(k)))].slice(0, 500) : []);
  const sections: Section[] = [];
  for (const r of raw.sections.slice(0, 50)) {
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id || s.id.length > 64 || typeof s.kind !== "string" || !kinds.includes(s.kind)) continue;
    const out: Section = { id: s.id, kind: s.kind as SectionKind, column: s.column === "left" ? "left" : "right" };
    if (page === "health") out.column = "left";
    if (s.hidden === true) out.hidden = true;
    if (typeof s.title === "string" && s.title.trim() && s.kind === "fields") out.title = s.title.trim().slice(0, 100);
    if (s.kind === "fields" || s.kind === "health") out.fields = keys(s.fields);
    sections.push(out);
  }
  return page === "detail" ? { sections, hiddenFields: keys(raw.hiddenFields) } : { sections };
}

/** Untrusted stored JSON -> { detail?, health? } as typed objects (resolve* does the rest). */
export function readParticipantLayout(json: unknown): ParticipantLayout {
  if (!json || typeof json !== "object") return {};
  const o = json as Record<string, unknown>;
  const pick = (v: unknown) => (v && typeof v === "object" && Array.isArray((v as PageLayout).sections) ? (v as PageLayout) : undefined);
  return { detail: pick(o.detail), health: pick(o.health) };
}

// ---- editing ----

/** Move a section before `beforeId` (null = end) and into `column`. */
export function moveSection(layout: PageLayout, id: string, beforeId: string | null, column: Column): PageLayout {
  const moving = layout.sections.find((s) => s.id === id);
  if (!moving || id === beforeId) return layout;
  const rest = layout.sections.filter((s) => s.id !== id);
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, { ...moving, column });
  return { ...layout, sections: rest };
}

/** Move a field (from any section or hiddenFields) into section `toId` before `beforeKey` (null = end); toId null = hide. */
export function moveField(layout: PageLayout, key: string, toId: string | null, beforeKey: string | null = null): PageLayout {
  const without = (list: string[] = []) => list.filter((k) => k !== key);
  const insert = (list: string[]) => {
    const at = beforeKey ? list.indexOf(beforeKey) : -1;
    const out = [...list];
    out.splice(at < 0 ? out.length : at, 0, key);
    return out;
  };
  return {
    ...layout,
    sections: layout.sections.map((s) => (s.fields ? { ...s, fields: s.id === toId ? insert(without(s.fields)) : without(s.fields) } : s)),
    hiddenFields: toId === null ? [...without(layout.hiddenFields), key] : without(layout.hiddenFields),
  };
}

/** Order of sections as read: left column top-down, then right. */
export const visualSections = (layout: PageLayout) => [...layout.sections.filter((s) => s.column === "left"), ...layout.sections.filter((s) => s.column === "right")];

/** Custom field keys in visual order, hidden ones last -- written to sortOrder. */
export const detailFieldOrder = (layout: PageLayout) => [...visualSections(layout).flatMap((s) => s.fields ?? []), ...(layout.hiddenFields ?? [])];

/**
 * Health config after the detail page's "Zdravotní poznámky" membership went
 * from `before` to `after`; null when unchanged. Dropped members leave the
 * config, new ones are appended; everything else is untouched.
 */
export function healthConfigForDetail(config: HealthNoteConfig[], before: string[], after: string[]): HealthNoteConfig[] | null {
  const removed = new Set(before.filter((k) => !after.includes(k)));
  const added = after.filter((k) => !before.includes(k));
  if (!removed.size && !added.length) return null;
  const out = config.filter((c) => !removed.has(c.fieldKey));
  for (const k of added) if (!out.some((c) => c.fieldKey === k)) out.push({ fieldKey: k, places: [...NEW_NOTE_PLACES], highlight: false });
  return out;
}

/**
 * Health config after the Zdraví detail's notes list became `notes` (place
 * "detail", in this order): entries with "detail" take the notes' order in
 * their slots, others stay put; dropped notes lose "detail", new ones gain it.
 */
export function healthConfigForNotes(config: HealthNoteConfig[], notes: string[]): HealthNoteConfig[] {
  const wanted = new Set(notes);
  const updated = config.map((c) => {
    const has = c.places.includes("detail");
    if (has === wanted.has(c.fieldKey)) return c;
    return { ...c, places: has ? c.places.filter((p) => p !== "detail") : (["detail", ...c.places] as HealthNotePlace[]) };
  });
  for (const k of notes) if (!updated.some((c) => c.fieldKey === k)) updated.push({ fieldKey: k, places: ["detail"], highlight: false });
  const byKey = new Map(updated.map((c) => [c.fieldKey, c]));
  let i = 0;
  return updated.map((c) => (c.places.includes("detail") ? byKey.get(notes[i++])! : c));
}
