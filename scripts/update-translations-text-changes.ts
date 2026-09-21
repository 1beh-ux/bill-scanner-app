// One-off, idempotent: existing translation rows whose TEXT changes with the
// bills/Drive work (overwrites exactly the listed keys; everything else is
// scripts/seed-missing-translations.ts, which never overwrites).
//
//   npx tsx scripts/update-translations-text-changes.ts            # dry run
//   npx tsx scripts/update-translations-text-changes.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

export const CHANGES: { key: string; cs: string; en: string }[] = [
  { key: "rates.backfillHint", cs: "Počet dní zpět (max 366).", en: "Days back (max 366)." },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  let changed = 0;
  for (const r of CHANGES) {
    const existing = await prisma.translation.findUnique({ where: { key: r.key } });
    if (existing && existing.cs === r.cs && existing.en === r.en) continue;
    changed++;
    console.log(`  ${apply ? "set" : "would set"}: ${r.key}${existing ? `\\n      cs: ${existing.cs}  ->  ${r.cs}` : " (new)"}`);
    if (apply) await prisma.translation.upsert({ where: { key: r.key }, update: { cs: r.cs, en: r.en }, create: r });
  }
  console.log(`${apply ? "Applied" : "Dry run"}: ${changed} change(s).${apply ? "" : " Re-run with --apply."}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
