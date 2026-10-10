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

// /r and /p use no files from public/ (fonts come from Google, the rest from /_next/).
const PUBLIC_HOST_PREFIXES = ["/r/", "/p/", "/api/public/", "/api/portal/", "/_next/"];

/** What a public host serves: the registration page, the portal, their APIs and Next's assets. "/" is the landing page. */
export function publicHostAllows(pathname: string): boolean {
  return pathname === "/" || pathname === "/favicon.ico" || PUBLIC_HOST_PREFIXES.some((p) => pathname.startsWith(p));
}
