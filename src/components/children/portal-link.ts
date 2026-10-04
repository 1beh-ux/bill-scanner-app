// Client helpers for the parent portal link (Lidé list + child detail + families).

async function copyFrom(url: string, body: object): Promise<boolean> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return false;
  const { url: link } = await res.json();
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}

/** Gets the child's link (created on first use, never replaced here) and copies it. False = failed. */
export const copyPortalLink = (childId: string) => copyFrom(`/api/children/${childId}`, { action: "token" });

/** Same for a family's link (slice 3 B). */
export const copyFamilyLink = (familyId: string) => copyFrom("/api/families", { action: "token", familyId });

/** Compose target id of a family's link (src/lib/portal-email.ts FAMILY_TARGET_PREFIX). */
export const familyTarget = (familyId: string) => `family:${familyId}`;

// The "send link" compose page gets its children through sessionStorage, like
// the participant compose page (src/lib/compose-handoff.ts): hundreds of ids
// don't belong in a URL.
const KEY = "childrenCompose";

export function portalComposeHref(childIds: string[]): string {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(childIds));
    return "/children/compose";
  } catch {
    return `/children/compose?ids=${childIds.join(",")}`;
  }
}

export function readPortalComposeIds(query: URLSearchParams): string[] {
  const inUrl = query.get("ids");
  if (inUrl) return inUrl.split(",").filter(Boolean);
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
