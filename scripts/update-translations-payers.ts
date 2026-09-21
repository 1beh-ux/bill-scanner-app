// One-off, idempotent: the "Autoři / Zaplatil" -> "Plátci / Payers" rename for
// translation rows that ALREADY exist (the seed scripts only help a fresh
// install). This DOES overwrite exactly the keys listed here -- nothing else.
//
//   npx tsx scripts/update-translations-payers.ts            # dry run (default)
//   npx tsx scripts/update-translations-payers.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

export const RENAMES: { key: string; cs: string; en: string }[] = [
  { key: "nav.authors", cs: "Plátci (všechny akce)", en: "Payers (all events)" },
  { key: "authors.title", cs: "Plátci (všechny akce)", en: "Payers (all events)" },
  { key: "authors.confirmDelete", cs: 'Opravdu smazat plátce "{name}"?', en: 'Really delete payer "{name}"?' },
  { key: "authors.empty", cs: "Zatím žádní plátci.", en: "No payers yet." },
  { key: "authors.error.already_merged", cs: "Tento plátce je již sloučen.", en: "This payer has already been merged." },
  { key: "authors.error.cannot_merge_self", cs: "Nelze sloučit plátce sám se sebou.", en: "Cannot merge a payer into itself." },
  { key: "authors.error.source_not_found", cs: "Zdrojový plátce nenalezen.", en: "Source payer not found." },
  { key: "authors.error.target_inactive", cs: "Cílový plátce není aktivní.", en: "Target payer is not active." },
  { key: "authors.error.target_not_found", cs: "Cílový plátce nenalezen.", en: "Target payer not found." },
  { key: "authors.errorAddFailed", cs: "Nepodařilo se přidat plátce.", en: "Failed to add payer." },
  { key: "authors.errorDeleteFailed", cs: "Nepodařilo se smazat plátce.", en: "Failed to delete payer." },
  {
    key: "authors.mergeConfirmDialog",
    cs: 'Opravdu sloučit "{source}" do "{target}"? Účtenky a přístup k akcím se přesunou, plátce "{source}" bude archivován.',
    en: 'Really merge "{source}" into "{target}"? Bills and event access will move over, payer "{source}" will be archived.',
  },
  { key: "authors.mergeTargetPlaceholder", cs: "Vyberte cílového plátce", en: "Select target payer" },
  { key: "authors.namePlaceholder", cs: "Jméno plátce", en: "Payer name" },
  { key: "authors.submit", cs: "Přidat plátce", en: "Add payer" },
  { key: "billModal.error.no_payer", cs: "Nelze označit — účtenka nemá plátce k proplacení.", en: "Cannot mark as paid — no payer set for this bill." },
  { key: "billModal.payer", cs: "Plátce", en: "Payer" },
  { key: "driveSettings.importAuthorsSummary", cs: "Plátci: {matched} spárováno, {created} nově vytvořeno", en: "Payers: {matched} matched, {created} newly created" },
  {
    key: "paymentsPage.markPaidConfirm",
    cs: "Opravdu označit účtenky plátce {name} jako proplacené (počet: {count})?",
    en: "Really mark the bills of {name} as paid out (count: {count})?",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  let changed = 0;
  let same = 0;
  let missing = 0;
  for (const r of RENAMES) {
    const existing = await prisma.translation.findUnique({ where: { key: r.key } });
    if (!existing) {
      missing++;
      console.log(`  ${apply ? "create" : "would create"}: ${r.key}`);
      if (apply) await prisma.translation.create({ data: r });
    } else if (existing.cs === r.cs && existing.en === r.en) {
      same++;
    } else {
      changed++;
      console.log(`  ${apply ? "update" : "would update"}: ${r.key}\n      cs: ${existing.cs}  ->  ${r.cs}`);
      if (apply) await prisma.translation.update({ where: { key: r.key }, data: { cs: r.cs, en: r.en } });
    }
  }
  console.log(`${apply ? "Applied" : "Dry run"}: ${changed} changed, ${missing} created, ${same} already up to date.${apply ? "" : " Re-run with --apply."}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
