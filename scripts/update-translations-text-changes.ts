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
  // wording aligned with the bill detail page ("Proplaceno / Neproplaceno") -- only matters where the
  // earlier version of seed-missing-translations.ts already ran (development databases)
  { key: "billModal.markPaidConfirm", cs: "Označit tuto účtenku jako proplacenou plátci?", en: "Mark this bill as paid out to the payer?" },
  { key: "billModal.markUnpaidConfirm", cs: "Zrušit u této účtenky označení „proplaceno“?", en: "Remove the “paid out” mark from this bill?" },
  { key: "billsPage.confirmBulkMarkPaid", cs: "Označit vybrané účtenky jako proplacené (počet: {count})?", en: "Mark the selected bills as paid out (count: {count})?" },
  { key: "billsPage.confirmBulkMarkUnpaid", cs: "Zrušit u vybraných účtenek označení „proplaceno“ (počet: {count})?", en: "Remove the “paid out” mark from the selected bills (count: {count})?" },
  { key: "paymentsPage.alreadyPaidOut", cs: "již proplaceno {amount}, počet: {count}", en: "already paid out {amount}, count: {count}" },
  { key: "paymentsPage.itemPaidOut", cs: "proplaceno", en: "paid out" },
  // {count} needs Czech grammatical agreement (1 účtenku / 2-4 účtenky / 5+ účtenek) that plain
  // interpolation can't give -- reworded to state the count instead of inflecting around it,
  // same pattern already used for confirmBulkMarkPaid/Unpaid above.
  { key: "billsPage.confirmBulkDelete", cs: "Opravdu smazat vybrané účtenky (počet: {count})? Tuto akci nelze vrátit.", en: "Really delete the selected bills (count: {count})? This cannot be undone." },
  { key: "participantsPage.confirmBulkDelete", cs: "Opravdu smazat vybrané účastníky (počet: {count})? Smažou se i jejich záznamy a plány léků. Tuto akci nelze vrátit.", en: "Really delete the selected participants (count: {count})? Their records and med plans will be deleted too. This cannot be undone." },
  // Same fix, the rest of the bills/payments strings with the same "{count} <genitive-plural
  // noun>" problem (only correct for 5+, wrong for 1 and 2-4). Not sweeping the whole app for
  // this -- Mail/Health strings (bulkSendSummaries, bulkStatusModal, participantImportPage, ...)
  // are outside this change's scope and are left as a known issue.
  { key: "billsPage.confirmBulkAi", cs: "Opravdu spustit AI zpracování pro vybrané účtenky (počet: {count})? Zůstaňte na této stránce, dokud zpracování neskončí.", en: "Really run AI processing for the selected bills (count: {count})? Stay on this page until it finishes." },
  { key: "billsPage.bulkAiActive", cs: "Počet účtenek zpracovávaných AI: {count}.", en: "Bills currently being processed by AI: {count}." },
  { key: "billsPage.bulkMoveConfirm", cs: "Opravdu přesunout vybrané účtenky (počet: {count}) do akce „{name}“?", en: "Really move the selected bills (count: {count}) to “{name}”?" },
  { key: "billsPage.totalExcludes", cs: "nezahrnuje účtenky bez kurzu (počet: {count})", en: "excludes bills without a rate (count: {count})" },
  { key: "importPage.doneMessage", cs: "Hotovo — importováno účtenek: {count}.", en: "Done — bills imported: {count}." },
  { key: "importPage.confirmPartialFailure", cs: "Nepodařilo se nastavit počet účtenek: {count} — zkontrolujte je prosím v seznamu.", en: "Could not update, count of bills: {count} — please check them in the list." },
  { key: "paymentsPage.unmarkPaidConfirm", cs: "Opravdu zrušit vyplacení pro {name} (počet dokladů: {count})?", en: "Really unmark as paid for {name} (count of bills: {count})?" },
  { key: "rates.recalcPending", cs: "Čeká na přepočet do Kč, počet účtenek: {count}.", en: "Waiting for CZK conversion, bill count: {count}." },
  { key: "events.error.event_has_bills", cs: "Tuto akci nelze smazat, protože obsahuje doklady (počet: {count}). Nejprve doklady přesuňte nebo smažte.", en: "This event cannot be deleted because it contains bills (count: {count}). Move or delete the bills first." },
  // flagged as "still English" in the retest -- "import" reads as an untranslated placeholder
  // next to the other nominalized entries here even though it's also a standard Czech word.
  { key: "authors.auditSource.import", cs: "import z Drive", en: "Drive import" },
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
