// Redesign R11 (Q-R5, 2026-11-23): the assistant's hints in the field panel -- a fixed set of checks computed from
// the overview (and the template check). Each hint may carry its one-click fix. Pure.
import type { OvField } from "@/lib/fields-overview";

export type DocUse = { docTypeId: string; name: string; placeholders: { key: string }[] };
export type Fix = { kind: "patch"; body: Record<string, unknown> } | { kind: "tab"; tab: string };
export type Hint = { id: string; level: "warn" | "info"; params?: Record<string, string>; fix?: Fix };

/**
 * 1 asked_hidden      asked in the registration form, but parents can't see / correct it in the portal
 * 2 docs_switched_off a template uses it, but the field is switched off for documents in this event
 * 3 old_name_in_docs  a template still uses an old name (alias) of it
 * 4 calc_missing      a calculated field is built from a field the event doesn't have
 * 5 synced_inactive   a connection fills it, but it is switched off in this event
 * 6 unused            nobody fills it and nothing uses it
 * 7 contact_missing   (the contact e-mail) N participants have none under the current rule
 */
export function fieldHints(f: OvField, all: OvField[], docs: DocUse[] | null, extra: { contactMissing?: number } = {}): Hint[] {
  const out: Hint[] = [];
  // A field this event doesn't use, or one of the form's own fixed questions: nothing to suggest.
  if (!f.inEvent || f.kind === "form") return out;
  if (f.required && f.portalAccess === "hidden") out.push({ id: "asked_hidden", level: "warn", fix: { kind: "patch", body: { portalAccess: "edit" } } });
  const names = new Set([f.key, ...f.aliases]);
  const using = (docs ?? []).filter((d) => d.placeholders.some((p) => names.has(p.key)));
  if (using.length && !f.surfaces.includes("documents")) out.push({ id: "docs_switched_off", level: "warn", params: { n: String(using.length) }, fix: { kind: "patch", body: { surface: { use: "documents", on: true } } } });
  const oldNames = (docs ?? []).filter((d) => d.placeholders.some((p) => f.aliases.includes(p.key)));
  if (oldNames.length) out.push({ id: "old_name_in_docs", level: "info", params: { n: String(oldNames.length) }, fix: { kind: "tab", tab: "documents" } });
  const keys = new Set(all.map((x) => x.key));
  const missing = f.deps.filter((d) => !keys.has(d));
  if (f.calculated && missing.length) out.push({ id: "calc_missing", level: "warn", params: { keys: missing.join(", ") } });
  if (!f.active && f.sources.some((s) => s.startsWith("sync:"))) out.push({ id: "synced_inactive", level: "info" });
  if (f.active && !f.calculated && f.kind === "custom" && !f.values.profiles && !f.values.registrations && !f.sources.length && !f.uses.length && !using.length) out.push({ id: "unused", level: "info" });
  if (f.computedType === "contact_email" && extra.contactMissing) out.push({ id: "contact_missing", level: "warn", params: { n: String(extra.contactMissing) } });
  return out;
}
