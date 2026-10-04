// Client helpers for the parent portal link (Děti list + child detail).

/** Gets the child's link (created on first use, never replaced here) and copies it. False = failed. */
export async function copyPortalLink(childId: string): Promise<boolean> {
  const res = await fetch(`/api/children/${childId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "token" }),
  });
  if (!res.ok) return false;
  const { url } = await res.json();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

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
