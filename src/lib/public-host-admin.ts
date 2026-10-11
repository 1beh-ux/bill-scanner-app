// Organizace -> Připojení -> Veřejné adresy: checks for adding/editing a public
// host and the "Ověřit" check (docs/custom-domain.md).
import dns from "node:dns/promises";
import { prisma } from "@/lib/prisma";
import type { PublicHostPurpose } from "@/generated/prisma";
import { isAdminHost, normalizeOrigin } from "@/lib/host-rules";

const PURPOSES: PublicHostPurpose[] = ["registration", "portal", "both"];
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://Prihlasky.Example.cz:443/x" -> "prihlasky.example.cz". */
export const normalizeHostname = (raw: string) =>
  raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/\.$/, "");

// embedOrigins / embedPageUrl: only when the body has them (an older caller's whole-row PATCH keeps them).
export type HostInput = { hostname: string; purpose: PublicHostPurpose; eventId: string | null; isDefault: boolean; active: boolean; embedOrigins?: string[]; embedPageUrl?: string | null };

/**
 * "Weby, které smějí stránku vložit" (one per line or an array) and "Stránka portálu na webu
 * organizace" (portal hosts; https, its origin must be allowed). undefined = not in the body.
 */
export function checkEmbedInput(b: Record<string, unknown>, purpose: PublicHostPurpose): { embedOrigins?: string[]; embedPageUrl?: string | null } | { error: string } {
  const out: { embedOrigins?: string[]; embedPageUrl?: string | null } = {};
  if (b.embedOrigins !== undefined) {
    const raw = Array.isArray(b.embedOrigins) ? b.embedOrigins.map(String) : String(b.embedOrigins ?? "").split(/[\s,]+/);
    const list = raw.map((x) => x.trim()).filter(Boolean);
    const origins = list.map(normalizeOrigin);
    if (origins.some((o) => !o)) return { error: "bad_origin" };
    out.embedOrigins = [...new Set(origins as string[])].slice(0, 20);
  }
  if (b.embedPageUrl !== undefined) {
    const v = typeof b.embedPageUrl === "string" ? b.embedPageUrl.trim() : "";
    if (!v || purpose === "registration") out.embedPageUrl = null;
    else {
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        return { error: "bad_embed_page" };
      }
      if (u.protocol !== "https:" || u.hash) return { error: "bad_embed_page" };
      out.embedPageUrl = u.toString();
    }
  }
  return out;
}

/** Validated row data, or an error code for the UI. */
/** organizationId: the acting organization -- the event and the default rule are within it. */
export async function checkHostInput(body: unknown, id: string | null, organizationId: string): Promise<{ data: HostInput } | { error: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const hostname = normalizeHostname(String(b.hostname ?? ""));
  const purpose = b.purpose as PublicHostPurpose;
  if (!HOSTNAME.test(hostname)) return { error: "bad_hostname" };
  if (isAdminHost(hostname)) return { error: "admin_hostname" };
  if (!PURPOSES.includes(purpose)) return { error: "bad_purpose" };
  // The portal is a family link across events: only registration hosts can be tied to one event.
  const eventId = purpose === "registration" && typeof b.eventId === "string" && b.eventId ? b.eventId : null;
  if (eventId && !(await prisma.event.findFirst({ where: { id: eventId, organizationId }, select: { id: true } }))) return { error: "bad_event" };
  const active = b.active !== false;
  // A default serves every event of its organization, so it can't be tied to one.
  const isDefault = b.isDefault === true && !eventId;
  // Hostnames are global: one hostname, one organization.
  if (await prisma.publicHost.findFirst({ where: { hostname, NOT: id ? { id } : undefined } })) return { error: "hostname_taken" };
  if (isDefault && active) {
    // At most one active default per purpose in an organization; "both" counts for both.
    const overlapping: PublicHostPurpose[] = purpose === "both" ? PURPOSES : [purpose, "both"];
    const other = await prisma.publicHost.findFirst({ where: { organizationId, isDefault: true, active: true, purpose: { in: overlapping }, NOT: id ? { id } : undefined } });
    if (other) return { error: "default_taken" };
  }
  const embed = checkEmbedInput(b, purpose);
  if ("error" in embed) return embed;
  // The page embedding the portal must be one of the allowed websites.
  if (embed.embedPageUrl) {
    const origins = embed.embedOrigins ?? (id ? (await prisma.publicHost.findUnique({ where: { id }, select: { embedOrigins: true } }))?.embedOrigins : []) ?? [];
    if (!origins.includes(new URL(embed.embedPageUrl).origin)) return { error: "embed_page_origin" };
  }
  return { data: { hostname, purpose, eventId, isDefault, active, ...embed } };
}

export type VerifyResult = "ok" | "dns" | "tls" | "page" | "no_lb_ip";

/** Does the hostname resolve to the load balancer (LB_IP; CNAMEs are followed), and does it serve the landing page over HTTPS? */
export async function verifyHost(hostname: string): Promise<{ result: VerifyResult; detail?: string }> {
  const lbIp = process.env.LB_IP;
  if (!lbIp) return { result: "no_lb_ip" };
  const ips = await dns.resolve4(hostname).catch(() => [] as string[]);
  if (!ips.includes(lbIp)) return { result: "dns", detail: ips.join(", ") || undefined };
  try {
    const res = await fetch(`https://${hostname}/`, { redirect: "manual", signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const html = res.ok ? await res.text() : "";
    return html.includes("data-public-landing") ? { result: "ok" } : { result: "page", detail: `HTTP ${res.status}` };
  } catch (err) {
    // Node's fetch puts the TLS/socket error code in err.cause.code.
    const code = String((err as { cause?: { code?: string } }).cause?.code ?? "");
    if (/CERT|TLS|SSL|EPROTO|ECONNRESET/.test(code)) return { result: "tls", detail: code };
    return { result: "page", detail: code || (err as Error).name };
  }
}

/** body.organizationId if it names an active organization, else the fallback; null = a bad id. */
export async function hostOrganization(body: unknown, fallback: string): Promise<string | null> {
  const wanted = (body as { organizationId?: unknown } | null)?.organizationId;
  if (typeof wanted !== "string" || !wanted) return fallback;
  return (await prisma.organization.findFirst({ where: { id: wanted, active: true }, select: { id: true } }))?.id ?? null;
}
