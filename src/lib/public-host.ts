// Public hosts (docs/custom-domain.md): which hostname serves the registration
// page and/or the parent portal, and which base a public link gets. The rows
// live in public_hosts (Organizace -> Připojení -> Veřejné adresy); the proxy
// only knows "admin host or not" (src/lib/host-rules.ts).
import { prisma } from "@/lib/prisma";
import type { PublicHostPurpose } from "@/generated/prisma";
import { isAdminHost, requestHost } from "@/lib/host-rules";

type HostRow = { hostname: string; purpose: PublicHostPurpose; eventId: string | null; isDefault: boolean; organizationId: string };
type Want = "registration" | "portal";

// ponytail: per-instance cache, so another instance sees an admin's change within TTL_MS.
const TTL_MS = 60_000;
let cache: { rows: HostRow[]; at: number } | null = null;

async function activeHosts(): Promise<HostRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await prisma.publicHost.findMany({ where: { active: true }, select: { hostname: true, purpose: true, eventId: true, isDefault: true, organizationId: true } });
  cache = { rows, at: Date.now() };
  return rows;
}

/** After an admin change: this instance sees it at once. */
export function invalidatePublicHosts() {
  cache = null;
}

export const serves = (purpose: PublicHostPurpose, want: Want) => purpose === want || purpose === "both";

// A public host belongs to one organization: it never shows another organization's events or families.
export type HostScope = { kind: "admin" } | { kind: "public"; purpose: PublicHostPurpose; eventId: string | null; organizationId: string } | { kind: "unknown" };

export async function resolvePublicHost(source: Request | Headers): Promise<HostScope> {
  const host = requestHost(source instanceof Headers ? source : source.headers);
  if (isAdminHost(host)) return { kind: "admin" };
  const row = (await activeHosts()).find((r) => r.hostname === host);
  return row ? { kind: "public", purpose: row.purpose, eventId: row.eventId, organizationId: row.organizationId } : { kind: "unknown" };
}

/** /r/<slug> of this event on this host: admin host, or a registration host of the event's organization for all events / this one. */
export const hostAllowsRegistration = (scope: HostScope, event: { id: string; organizationId: string }) =>
  scope.kind === "admin" ||
  (scope.kind === "public" && serves(scope.purpose, "registration") && scope.organizationId === event.organizationId && (scope.eventId === null || scope.eventId === event.id));

/** /p/<token> on this host: admin host, or a portal host of the family's / person's organization. */
export const hostAllowsPortal = (scope: HostScope, organizationId: string) =>
  scope.kind === "admin" || (scope.kind === "public" && serves(scope.purpose, "portal") && scope.organizationId === organizationId);

/** Hostname for a public link: the event's own registration host, else the organization's active default for that purpose. */
export async function publicHostFor(want: Want, eventId: string | null, organizationId: string): Promise<string | null> {
  const rows = (await activeHosts()).filter((r) => serves(r.purpose, want) && r.organizationId === organizationId);
  const own = want === "registration" && eventId ? rows.find((r) => r.eventId === eventId) : undefined;
  // An exact-purpose default wins over a "both" one.
  const defaults = rows.filter((r) => r.isDefault && r.eventId === null);
  return (own ?? defaults.find((r) => r.purpose === want) ?? defaults[0])?.hostname ?? null;
}

/**
 * Public link for /r/<slug> or /p/<token>: event host -> default host for the
 * purpose (both of the organization) -> PORTAL_BASE_URL (portal only, legacy) -> PUBLIC_BASE_URL -> APP_BASE_URL.
 * path "" = just the base. Null = nothing configured.
 */
export async function publicUrl(want: Want, eventId: string | null, path: string, organizationId: string): Promise<string | null> {
  const host = await publicHostFor(want, eventId, organizationId);
  if (host) return `https://${host}${path}`;
  const base = ((want === "portal" && process.env.PORTAL_BASE_URL) || process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL)?.replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}
