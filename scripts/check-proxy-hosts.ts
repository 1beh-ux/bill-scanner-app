// Runs src/proxy.ts against hosts x paths and prints pass/fail (docs/custom-domain.md).
// npx tsx scripts/check-proxy-hosts.ts   -- no DB, no network. Exit 1 on any failure.
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

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

let failed = 0;
for (const [host, expected] of Object.entries(EXPECT)) {
  for (const path of PATHS) {
    const got = outcome(proxy(new NextRequest(`http://localhost:8080${path}`, { headers: { host } })));
    const ok = got === expected[path];
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${host.padEnd(44)} ${path.padEnd(18)} ${got}${ok ? "" : `   (expected ${expected[path]})`}`);
  }
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
