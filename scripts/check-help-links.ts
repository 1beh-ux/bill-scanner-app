// Every "?" help link points to an existing content/help page, and every image a page shows exists.
// npx tsx scripts/check-help-links.ts
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const pages = new Set(readdirSync("content/help").filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)));
const slugs = new Set(execSync("grep -rhoE 'slug=\"[a-z0-9-]+\"' src --include=*.tsx || true").toString().match(/"[a-z0-9-]+"/g)?.map((s) => s.slice(1, -1)) ?? []);
const sidebar = readFileSync("src/components/AppSidebar.tsx", "utf8").match(/SECTION_HELP[^=]*= \{([^}]*)\}/)?.[1] ?? "";
for (const m of sidebar.matchAll(/"([a-z0-9-]+)"/g)) slugs.add(m[1]);
const helpField = execSync("grep -rhoE 'help: \"[a-z0-9-]+\"' 'src/app/events/[id]/page.tsx' || true").toString().match(/"[a-z0-9-]+"/g)?.map((s) => s.slice(1, -1)) ?? [];
for (const s of helpField) slugs.add(s);
const missing = [...slugs].filter((s) => !pages.has(s));
assert.deepEqual(missing, [], `help links without a page: ${missing.join(", ")}`);
for (const p of pages) for (const m of readFileSync(`content/help/${p}.md`, "utf8").matchAll(/\]\((\/napoveda\/images\/[^)]+)\)/g))
  assert.ok(existsSync(`public${m[1]}`), `${p}.md: missing image ${m[1]}`);
console.log(`check-help-links: all passed (${slugs.size} links, ${pages.size} pages)`);
