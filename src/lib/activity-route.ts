// Usage metrics: page path -> route pattern + module (src/components/ActivityTracker.tsx,
// /api/activity). Client-safe, pure.

/** /events/abc/bills/def + {id:"abc", billId:"def"} -> /events/[id]/bills/[billId] (the app's own route params). */
export function routePattern(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const byValue = new Map<string, string>();
  for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) if (x) byValue.set(encodeURIComponent(x), k);
  return pathname.split("/").map((s) => (byValue.has(s) ? `[${byValue.get(s)}]` : s)).join("/");
}

// Server-side safety net: a segment that still looks like an id never gets stored.
const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+|[A-Za-z0-9_-]{24,})$/i;

/** Cleaned route, or null when it isn't an app page worth counting (public pages, login). */
export function cleanRoute(route: unknown): string | null {
  if (typeof route !== "string" || !route.startsWith("/") || route.length > 300) return null;
  const segs = route.split(/[?#]/)[0].split("/").slice(1).map((s) => (/^\[[A-Za-z]+\]$/.test(s) || !ID_LIKE.test(s) ? s : "[id]"));
  if (segs.some((s) => !/^[\w\-[\].%]*$/.test(s))) return null;
  // Not app usage: public form / portal / embeds, sign-in.
  if (["r", "p", "public-landing", "embed", "login"].includes(segs[0] ?? "")) return null;
  return "/" + segs.filter((s, i) => s || i === 0).join("/");
}

const EVENT_MODULES: Record<string, string> = { bills: "bills", budget: "bills", payers: "bills", payments: "bills", import: "bills", health: "health", mail: "mail", "document-templates": "mail", participants: "participants", planning: "planning" };

/** Module of a route: the event module for /events/[id]/…, the event settings, else the first segment. */
export function routeModule(route: string): string {
  const s = route.split("/").filter(Boolean);
  if (s[0] === "events" && s[1] === "[id]") return s[2] ? (EVENT_MODULES[s[2]] ?? s[2]) : "event-settings";
  return s[0] ?? "home";
}
