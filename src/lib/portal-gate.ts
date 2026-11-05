// Parent portal link + birth-date gate (docs/registration-portal-spec.md F/G).
// The link is /p/<token>: a random token, not derived from anything. After the
// birth date is entered once, the device keeps an httpOnly cookie holding an
// HMAC of child id + the current token -- so a new token also logs out every
// device. Tokens are secrets: never log them (or a URL containing one).
import crypto from "crypto";
import { portalLinkFor } from "@/lib/public-host";
import { prisma } from "@/lib/prisma";

/** 32 random bytes, base64url (43 chars). */
export function newPortalToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** PORTAL_SECRET, or null when unset/too short -- the portal then answers 503 instead of running with a guessable key. */
export function portalSecret(): string | null {
  const s = process.env.PORTAL_SECRET;
  return s && s.length >= 16 ? s : null;
}

// One cookie per child: a parent of siblings keeps both open on one device.
export const gateCookieName = (childId: string) => `portal_${childId}`;
export const GATE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function gateCookieValue(childId: string, token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${childId}:${token}`).digest("base64url");
}

export function gateCookieValid(value: string | undefined, childId: string, token: string, secret: string): boolean {
  if (!value) return false;
  const expected = Buffer.from(gateCookieValue(childId, token, secret));
  const got = Buffer.from(value);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/**
 * Public portal link: portalLinkFor() (the organization's web page embedding the portal,
 * the portal host, then the env bases); with none
 * of those, the origin the admin is using -- from the forwarded headers, since
 * behind Cloud Run the request URL is the container's internal address.
 */
/**
 * The parent-portal link of a token, from configuration only: the owner organization's portal host
 * (src/lib/public-host.ts portalLinkFor -> its env fallbacks), else PORTAL_BASE_URL / PUBLIC_BASE_URL /
 * APP_BASE_URL. Never from request headers (audit2 SEC-SIM1: a spoofed X-Forwarded-Host must not put an
 * attacker's domain into a mailed link). Null = nothing configured -- callers don't send a link then.
 */
export async function portalUrl(token: string): Promise<string | null> {
  const owner =
    (await prisma.child.findUnique({ where: { portalToken: token }, select: { organizationId: true } })) ??
    (await prisma.family.findUnique({ where: { portalToken: token }, select: { organizationId: true } }));
  if (owner) return portalLinkFor(owner.organizationId, token);
  const base = (process.env.PORTAL_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL)?.replace(/\/+$/, "");
  return base ? `${base}/p/${token}` : null;
}

/** {{portal_link_line}}: the whole sentence, or "" without a link (so the line vanishes). */
export const portalLinkLine = (link: string | null) =>
  link ? `Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: ${link} (při prvním otevření se zeptá na datum narození).` : "";
