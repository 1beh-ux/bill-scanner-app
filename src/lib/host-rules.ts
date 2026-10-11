// Admin app vs public hosts (docs/custom-domain.md). Pure host + path rules,
// no DB: the proxy runs these on every request. Which public host serves what
// is in the public_hosts table (src/lib/public-host.ts).

/** Request hostname: x-forwarded-host ?? host, lowercase, port stripped. */
export function requestHost(h: Headers): string {
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

/** ADMIN_HOSTS (default tabornik.online + www), *.run.app, localhost and Cloud Shell dev hosts. */
export function isAdminHost(host: string): boolean {
  const admin = (process.env.ADMIN_HOSTS ?? "tabornik.online,www.tabornik.online").split(",").map((s) => s.trim().toLowerCase());
  return (
    host === "" ||
    admin.includes(host) ||
    host.endsWith(".run.app") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".cloudshell.dev")
  );
}

// /r and /p use no files from public/ (fonts are self-hosted under /_next/, like everything else).
const PUBLIC_HOST_PREFIXES = ["/r/", "/p/", "/api/public/", "/api/portal/", "/_next/"];

/** What a public host serves: the registration page, the portal, their APIs and Next's assets. "/" is the landing page. */
export function publicHostAllows(pathname: string): boolean {
  return pathname === "/" || pathname === "/favicon.ico" || PUBLIC_HOST_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Framing headers (docs/custom-domain.md "Embedding"). Pages on admin hosts and everything on
 * public hosts except /r and /p: never framed. /r and /p on a public host: framed by that host's
 * embedOrigins (null = unknown host -> never). /api: X-Frame-Options only -- a route's own CSP
 * (the `sandbox` on document downloads) must survive, and Next keeps the proxy's header over the
 * route's. /__/: Firebase's sign-in helper, framed by our own pages -- left alone.
 */
export function framingHeaders(admin: boolean, pathname: string, embedOrigins: string[] | null): Record<string, string> {
  if (pathname.startsWith("/__/")) return {};
  const deny = { "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" };
  if (pathname.startsWith("/api/")) return { "X-Frame-Options": "DENY" };
  if (admin || !(pathname.startsWith("/r/") || pathname.startsWith("/p/")) || !embedOrigins?.length) return deny;
  return { "Content-Security-Policy": `frame-ancestors 'self' ${embedOrigins.join(" ")}` };
}

/**
 * An allowed embedder as stored: "https://host[:port]" (http only for localhost), lowercase,
 * no path / query / wildcard. Null = not a valid origin.
 */
export function normalizeOrigin(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!(u.protocol === "https:" || (u.protocol === "http:" && local))) return null;
  if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash || u.hostname.includes("*")) return null;
  return u.origin.toLowerCase();
}
