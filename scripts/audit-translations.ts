// Translation audit: finds raw translation keys that would show up in the UI.
//
//   npx tsx scripts/audit-translations.ts            # readable report
//   npx tsx scripts/audit-translations.ts --json     # machine-readable
//   npx tsx scripts/audit-translations.ts --strict   # exit 1 if anything is missing/empty (for CI/re-audit)
//
// READ-ONLY: it only reads the `translations` table (whatever DATABASE_URL points at).
//
// What it checks
//  (a) every key used in code: t("..."), t('...'), t(`...`), and keys held in constants
//      (labelKey: "...", etc. -- any string literal that matches a known key prefix);
//      dynamic keys t(`prefix.${x}`) are reported by prefix, and for the prefixes listed in
//      DYNAMIC_CANDIDATES the possible suffixes (error codes, statuses, module keys ...) are
//      enumerated from the code and checked too;
//  (b) the `translations` table plus every key defined in prisma/seed.ts and scripts/seed-*.ts;
//  (c) reports, grouped by page/module (first key segment):
//        MISSING     used in code, defined nowhere
//        NOT IN DB   used, defined in a seed script only (a seed script has not been run here)
//        EMPTY       cs or en empty
//        SAME AS KEY cs/en equals the key or is only a key-like string
//        SUSPECT     near-duplicate keys (probable typos, e.g. billsPage.noRate / billsPage.norate)
//        UNUSED      in the table but not found in code (informational, capped)
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "generated") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ---- (b) keys defined in seed scripts: see scripts/lib/translation-sources.ts
import { seedDefinitions, type SeedDef as Def } from "./lib/translation-sources";

// ---- (a) keys used in code ------------------------------------------------------------
const KEY_LIKE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/;

// Possible suffixes for dynamic keys, gathered from the code. prefix -> candidates.
function collectCodes(globs: string[], pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const g of globs) {
    for (const f of walk(path.join(ROOT, g))) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(pattern)) found.add(m[1]);
    }
  }
  return [...found];
}
function unionMembers(file: string, typeName: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = text.match(new RegExp(`type ${typeName}\\s*=([^;]+);`));
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
}

function enumValues(name: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const m = text.match(new RegExp(`enum ${name}\\s*\\{([^}]*)\\}`));
  return m ? m[1].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean) : [];
}

function dynamicCandidates(): Record<string, string[]> {
  const apiCodes = (globs: string[]) => collectCodes(globs, /error:\s*"([a-z][a-z0-9_]+)"/g);
  const driveCodes = [...unionMembers("src/lib/drive-errors.ts", "DriveErrorCode"), ...apiCodes(["src/lib/drive-import.ts", "src/lib/drive-export.ts"].map((f) => path.dirname(f)))].filter((c) => !c.includes("__"));
  return {
    "driveSettings.error.": [...unionMembers("src/lib/drive-errors.ts", "DriveErrorCode"), "same_folder", "event_not_found", "event_closed_locked", "no_ingest_folder", "no_export_folder", "no_approved_bills", ...collectCodes(["src/lib"], /new DriveImportError\("([a-z_]+)"\)/g), ...collectCodes(["src/lib"], /new DriveExportError\("([a-z_]+)"\)/g)],
    "driveSettings.warning.": ["no_connection", "token_invalid", "user_inactive"],
    "driveSettings.folder.": ["ingest", "export", "participants", "generic"],
    "billModal.error.": apiCodes(["src/app/api/bills", "src/lib"]).filter((c) => !driveCodes.includes(c) || true),
    "authors.error.": apiCodes(["src/app/api/authors"]),
    "authors.auditSource.": ["event_edit", "admin_edit", "merge", "create", "import"],
    "payers.error.": [...apiCodes(["src/app/api/events/[id]/payers"]), "bank_incomplete", "invalid_bank_account", "generic"],
    "importPage.failure.": ["invalid_pdf"],
    "importPage.result.kind.": ["imported", "duplicate", "skipped", "failed"],
    "templateCheck.status.": ["ok", "field_off", "unknown", "invalid"],
    "paymentsPage.bills.": ["one", "few", "many"],
    "adminOverview.warning.": ["no_connection", "token_invalid", "user_inactive"],
    "nav.": ["health", "mail", "bills"],
    "billsPage.status": ["New", "Queued", "Processing", "AutoApproved", "ToReview", "Failed", "Approved"],
    "participantFieldAdmin.surface.": ["list", "health_list", "health_detail", "mail_list", "documents", "import"],
    "participantFieldAdmin.kind.": ["custom", "builtin", "guardian", "computed"],
    "participantFieldAdmin.type.": unionMembers("src/components/participants/ParticipantFieldAdmin.tsx", "FieldType"),
    "incidentForm.category.": enumValues("IncidentCategory"),
    "mailActionLogModal.action.": enumValues("MailActionType"),
    "medGridPage.preset.": unionMembers("src/app/events/[id]/health/meds/page.tsx", "Preset"),
    "participantImportPage.error.": collectCodes(["src/app/events/[id]/participants/import"], /errors\.push\("([a-z_]+)"\)/g),
    "eventDetail.error.": ["lifecycleGeneric", ...apiCodes(["src/app/api/events/[id]/close", "src/app/api/events/[id]/reopen"])],
    // the code can also be "HTTP <status>" for a non-JSON failure -- not enumerable
    "imageEditor.error.": apiCodes(["src/app/api/bills/[id]/image"]),
  };
}

type Use = { key: string; file: string };
function usedKeys(prefixes: Set<string>): { uses: Use[]; dynamic: { prefix: string; file: string }[] } {
  const uses: Use[] = [];
  const dynamic: { prefix: string; file: string }[] = [];
  for (const f of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, f);
    const text = fs.readFileSync(f, "utf8");
    // t("...") / t('...') and t(`...`) without interpolation
    for (const m of text.matchAll(/\bt\(\s*(["'`])([^"'`$\n]+)\1/g)) if (KEY_LIKE.test(m[2])) uses.push({ key: m[2], file: rel });
    // dynamic: t(`prefix.${...}`)
    for (const m of text.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) dynamic.push({ prefix: m[1], file: rel });
    // constants: any key-like string literal whose first segment is a known key prefix (labelKey, titleKey, ...)
    for (const m of text.matchAll(/(["'])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+)\1/g)) {
      if (KEY_LIKE.test(m[2]) && prefixes.has(m[2].split(".")[0])) uses.push({ key: m[2], file: rel });
    }
  }
  return { uses, dynamic };
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const dbRows = await prisma.translation.findMany();
  const db = new Map(dbRows.map((r) => [r.key, r]));
  const defs = seedDefinitions();
  const seedByKey = new Map<string, Def>();
  for (const d of defs) if (!seedByKey.has(d.key)) seedByKey.set(d.key, d);

  const prefixes = new Set([...dbRows.map((r) => r.key.split(".")[0]), ...defs.map((d) => d.key.split(".")[0])]);
  const { uses, dynamic } = usedKeys(prefixes);
  const usedSet = new Map<string, string>();
  for (const u of uses) if (!usedSet.has(u.key)) usedSet.set(u.key, u.file);

  // dynamic candidates
  const cand = dynamicCandidates();
  const dynamicPrefixes = [...new Set(dynamic.map((d) => d.prefix))].sort();
  const unenumerated = dynamicPrefixes.filter((p) => !(p in cand));
  for (const [prefix, list] of Object.entries(cand)) {
    if (!dynamicPrefixes.includes(prefix)) continue; // only enumerate what the code really builds
    for (const c of new Set(list)) if (!usedSet.has(prefix + c)) usedSet.set(prefix + c, `(dynamic ${prefix}\${…})`);
  }

  const missing: { key: string; file: string }[] = [];
  const notInDb: { key: string; file: string; seed: string }[] = [];
  for (const [key, file] of usedSet) {
    if (db.has(key)) continue;
    const s = seedByKey.get(key);
    if (s) notInDb.push({ key, file, seed: s.file });
    else missing.push({ key, file });
  }
  const empty = dbRows.filter((r) => !r.cs.trim() || !r.en.trim()).map((r) => ({ key: r.key, cs: r.cs, en: r.en }));
  const keyLike = (s: string, key: string) => s.trim() === key || KEY_LIKE.test(s.trim());
  const sameAsKey = dbRows.filter((r) => keyLike(r.cs, r.key) || keyLike(r.en, r.key)).map((r) => ({ key: r.key, cs: r.cs, en: r.en }));

  // near-duplicate keys inside the same page prefix
  const keys = [...new Set([...db.keys(), ...usedSet.keys()])].sort();
  const suspect: [string, string][] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < Math.min(keys.length, i + 40); j++) {
      const [a, b] = [keys[i], keys[j]];
      if (a.split(".")[0] !== b.split(".")[0] || a.length < 8) continue;
      if (a.toLowerCase() === b.toLowerCase() || (Math.abs(a.length - b.length) <= 1 && editDistance(a, b) === 1 && a.split(".").length === b.split(".").length && !/\d/.test(a + b) && a.replace(/[A-Z]/g, "").length === b.replace(/[A-Z]/g, "").length)) suspect.push([a, b]);
    }
  }
  const unused = dbRows.map((r) => r.key).filter((k) => !usedSet.has(k) && !dynamicPrefixes.some((p) => k.startsWith(p)));

  const group = <T extends { key: string }>(items: T[]) => {
    const g = new Map<string, T[]>();
    for (const it of items) g.set(it.key.split(".")[0], [...(g.get(it.key.split(".")[0]) ?? []), it]);
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  const result = { counts: { keysInDb: dbRows.length, keysUsedInCode: usedSet.size, missing: missing.length, notInDb: notInDb.length, empty: empty.length, sameAsKey: sameAsKey.length, suspect: suspect.length, unused: unused.length }, missing, notInDb, empty, sameAsKey, suspect, unenumeratedDynamicPrefixes: unenumerated };
  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const c = result.counts;
    console.log(`Translation audit -- ${c.keysInDb} keys in the database, ${c.keysUsedInCode} keys used in code\n`);
    const section = (title: string, items: { key: string }[], fmt: (i: never) => string) => {
      console.log(`${title}: ${items.length}`);
      for (const [g, list] of group(items)) {
        console.log(`  [${g}]`);
        for (const it of list) console.log(`    ${fmt(it as never)}`);
      }
      console.log("");
    };
    section("MISSING (used in code, defined nowhere -> raw key in the UI)", missing, (i: { key: string; file: string }) => `${i.key}    (${i.file})`);
    section("NOT IN DB (defined in a seed script that has not been run against this database)", notInDb, (i: { key: string; seed: string }) => `${i.key}    (${i.seed})`);
    section("EMPTY (cs or en is empty)", empty, (i: { key: string; cs: string; en: string }) => `${i.key}    cs="${i.cs}" en="${i.en}"`);
    section("SAME AS KEY (text is the key itself or key-like)", sameAsKey, (i: { key: string; cs: string; en: string }) => `${i.key}    cs="${i.cs}" en="${i.en}"`);
    console.log(`SUSPECT near-duplicate keys (possible typos): ${suspect.length}`);
    for (const [a, b] of suspect) console.log(`    ${a}  <->  ${b}`);
    console.log("");
    if (unenumerated.length > 0) console.log(`Dynamic key prefixes the audit cannot enumerate (check by hand): ${unenumerated.join(", ")}\n`);
    console.log(`UNUSED in code (informational, first 15 of ${unused.length}): ${unused.slice(0, 15).join(", ")}${unused.length > 15 ? ", …" : ""}\n`);
    console.log(`Summary: missing=${c.missing} notInDb=${c.notInDb} empty=${c.empty} sameAsKey=${c.sameAsKey} suspect=${c.suspect}`);
  }
  await prisma.$disconnect();
  if (STRICT && (missing.length > 0 || notInDb.length > 0 || empty.length > 0 || sameAsKey.length > 0)) process.exit(1);
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(2); });
