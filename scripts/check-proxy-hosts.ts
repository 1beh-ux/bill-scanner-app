// Runs src/proxy.ts against hosts x paths and prints pass/fail (docs/custom-domain.md).
// npx tsx scripts/check-proxy-hosts.ts   -- no DB, no network. Exit 1 on any failure.
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { framingHeaders, normalizeOrigin } from "../src/lib/host-rules";

process.env.CANONICAL_HOST = "tabornik.online";
delete process.env.ADMIN_HOSTS;

const RUN = "bill-scanner-app-sml4zhisya-ey.a.run.app";
const PATHS = ["/", "/login", "/api/bills", "/r/x", "/p/x", "/api/public/r/x", "/api/portal/x", "/_next/static/x", "/napoveda"];

// No session cookie: what a parent / a stranger gets. "next" = passed on to the app.
const admin: Record<string, string> = {
  "/": "307 /login", "/login": "next", "/api/bills": "401", "/r/x": "next", "/p/x": "next",
  "/api/public/r/x": "next", "/api/portal/x": "next", "/_next/static/x": "307 /login", "/napoveda": "307 /login",
};
const publicHost: Record<string, string> = {
  "/": "rewrite /public-landing", "/login": "404", "/api/bills": "404", "/r/x": "next", "/p/x": "next",
  "/api/public/r/x": "next", "/api/portal/x": "next", "/_next/static/x": "next", "/napoveda": "404",
};
const runApp = Object.fromEntries(PATHS.map((p) => [p, `308 https://tabornik.online${p}`]));
const EXPECT: Record<string, Record<string, string>> = { "tabornik.online": admin, "www.tabornik.online": runApp, [RUN]: runApp, "prihlasky.kasicka.eu": publicHost, "unknown.example.com": publicHost };

function outcome(res: Response): string {
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) return `rewrite ${new URL(rewrite).pathname}`;
  if (res.headers.get("x-middleware-next")) return "next";
  const loc = res.headers.get("location");
  if (loc) return `${res.status} ${loc.startsWith("http://localhost") ? new URL(loc).pathname : loc}`;
  return String(res.status);
}

async function main() {
let failed = 0;
for (const [host, expected] of Object.entries(EXPECT)) {
  for (const path of PATHS) {
    const got = outcome(await proxy(new NextRequest(`http://localhost:8080${path}`, { headers: { host } })));
    const ok = got === expected[path];
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${host.padEnd(44)} ${path.padEnd(18)} ${got}${ok ? "" : `   (expected ${expected[path]})`}`);
  }
}
// Framing headers (docs/custom-domain.md "Embedding").
const fh = (admin: boolean, path: string, origins: string[] | null) => JSON.stringify(framingHeaders(admin, path, origins));
const NONE = JSON.stringify({ "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" });
const FRAMING: [string, string, string][] = [
  ["admin page", fh(true, "/login", null), NONE],
  ["admin /r on the admin host", fh(true, "/r/x", ["https://www.zare.cz"]), NONE],
  ["api: X-Frame-Options only (route CSP kept)", fh(true, "/api/events/x/documents/y", null), JSON.stringify({ "X-Frame-Options": "DENY" })],
  ["firebase helper untouched", fh(true, "/__/auth/iframe", null), "{}"],
  ["public /r, no embedders", fh(false, "/r/x", []), NONE],
  ["public /p, unknown host", fh(false, "/p/x", null), NONE],
  ["public landing", fh(false, "/", ["https://www.zare.cz"]), NONE],
  ["public /r with embedders", fh(false, "/r/x", ["https://www.zare.cz", "https://zare.cz"]), JSON.stringify({ "Content-Security-Policy": "frame-ancestors 'self' https://www.zare.cz https://zare.cz" })],
  ["origin normalized", String(normalizeOrigin(" https://WWW.Zare.cz/ ")), "https://www.zare.cz"],
  ["origin with port", String(normalizeOrigin("https://zare.cz:8443")), "https://zare.cz:8443"],
  ["origin: path refused", String(normalizeOrigin("https://zare.cz/portal")), "null"],
  ["origin: http refused", String(normalizeOrigin("http://zare.cz")), "null"],
  ["origin: http localhost ok", String(normalizeOrigin("http://localhost:8080")), "http://localhost:8080"],
  ["origin: wildcard refused", String(normalizeOrigin("https://*.zare.cz")), "null"],
];
for (const [name, got, want] of FRAMING) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  framing: ${name}${ok ? "" : `   got ${got}, expected ${want}`}`);
}
const live = await proxy(new NextRequest("http://localhost:8080/login", { headers: { host: "tabornik.online" } }));
const liveOk = live.headers.get("x-frame-options") === "DENY" && live.headers.get("content-security-policy") === "frame-ancestors 'none'";
if (!liveOk) failed++;
console.log(`${liveOk ? "PASS" : "FAIL"}  framing: proxy sets the headers on tabornik.online/login`);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
}

main();
