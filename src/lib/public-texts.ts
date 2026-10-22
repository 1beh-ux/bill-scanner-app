// Own wording of the public pages' texts (2026-10-22): the registration form (public.*) and the parent
// portal (portal.*). The organization's (Organization.publicTexts) and an event's own on its registration
// page (Event.publicTexts) sit over the translations; the server merges them into the page's strings.
// Pure: the editors' validation and the self-check use it too.
export const PUBLIC_TEXT_PREFIXES = ["public.", "portal."] as const;
export const PUBLIC_TEXT_MAX = 3000;
export const isPublicTextKey = (k: string) => PUBLIC_TEXT_PREFIXES.some((p) => k.startsWith(p)) && /^[\w.-]{3,120}$/.test(k);

/** Stored / sent JSON -> { key: text }: known-shaped keys only, trimmed, empty = the default (left out). */
export function readPublicTexts(raw: unknown): Record<string, string> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (isPublicTextKey(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, PUBLIC_TEXT_MAX);
  return out;
}

/** A page's strings with the layers on top (later wins); only keys the page has. */
export function withPublicTexts(strings: Record<string, string>, ...layers: unknown[]): Record<string, string> {
  const out = { ...strings };
  for (const l of layers) for (const [k, v] of Object.entries(readPublicTexts(l))) if (k in out) out[k] = v;
  return out;
}
