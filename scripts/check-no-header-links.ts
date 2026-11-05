// SEC-SIM1 (audit2): mailed links never come from request headers. Only src/lib/host-rules.ts (routing: which
// host serves a request, checked against the DB) may read X-Forwarded-Host / Host. npx tsx scripts/check-no-header-links.ts
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const hits = execSync(`grep -rlE 'get\\("(x-forwarded-host|host)"\\)' src --include=*.ts --include=*.tsx || true`).toString().split("\n").filter(Boolean);
assert.deepEqual(hits.filter((f) => !["src/lib/host-rules.ts", "src/lib/request-security.ts"].includes(f)), [], "request host read outside host-rules / request-security");
// request-security reads Host only to pick the X-Forwarded-For hop (rate limits), never to build a URL.
assert.ok(!/https?:\/\/\$\{/.test(readFileSync("src/lib/request-security.ts", "utf8")), "request-security builds no URLs");
const gate = readFileSync("src/lib/portal-gate.ts", "utf8");
assert.match(gate, /export async function portalUrl\(token: string\): Promise<string \| null>/, "portalUrl takes no request");
assert.ok(!/headers\.get/.test(gate), "portal-gate reads no headers");
console.log("check-no-header-links: all passed");
