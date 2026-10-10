// Parent portal link + birth-date gate (docs/registration-portal-spec.md F/G).
// The link is /p/<token>: a random token, not derived from anything. After the
// birth date is entered once, the device keeps an httpOnly cookie holding an
// HMAC of child id + the current token -- so a new token also logs out every
// device. Tokens are secrets: never log them (or a URL containing one).
import crypto from "crypto";

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
 * Public portal link: publicBaseUrl() when configured; otherwise the origin the
 * admin is using -- from the forwarded headers, since behind Cloud Run the
 * request URL is the container's internal address.
 */
export function portalUrl(token: string, req: Request): string {
  const configured = publicBaseUrl();
  if (configured) return `${configured}/p/${token}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return `${origin}/p/${token}`;
}

/**
 * Base URL for public links (/r/<slug>, /p/<token>): PUBLIC_BASE_URL, else
 * PORTAL_BASE_URL (a later second domain for parents), else APP_BASE_URL (set
 * on Cloud Run, see docs/custom-domain.md). Null = none set.
 */
export function publicBaseUrl(): string | null {
  return (process.env.PUBLIC_BASE_URL || process.env.PORTAL_BASE_URL || process.env.APP_BASE_URL)?.replace(/\/+$/, "") || null;
}

/** Portal links outside a request (e-mail / document variables, slice 4 #11). */
export const portalBaseUrl = publicBaseUrl;

/** {{portal_link_line}}: the whole sentence, or "" without a link (so the line vanishes). */
export const portalLinkLine = (link: string | null) =>
  link ? `Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: ${link} (při prvním otevření se zeptá na datum narození).` : "";
