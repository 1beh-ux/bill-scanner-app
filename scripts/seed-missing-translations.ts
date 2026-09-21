// Idempotent: adds translation keys that are missing (or have an empty cs/en) and
// NEVER overwrites an existing non-empty text. Safe to run repeatedly, locally and
// against production. Collects the keys added by the roles/payers/Drive/bills work
// (see docs/drive-payers-roles-change-notes.md) plus anything the audit found missing.
//
//   npx tsx scripts/seed-missing-translations.ts
//
// Sequence against a live DB: scripts/audit-translations.ts -> this script -> audit again.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };

export const ROWS: Row[] = [
  // -- Part 8: confirmation dialog -------------------------------------------
  { key: "confirmDialog.title", cs: "Potvrzení", en: "Please confirm" },
  { key: "confirmDialog.dangerTitle", cs: "Jste si jisti?", en: "Are you sure?" },
  { key: "confirmDialog.noticeTitle", cs: "Upozornění", en: "Notice" },
  { key: "common.confirm", cs: "Potvrdit", en: "Confirm" },
  { key: "common.ok", cs: "OK", en: "OK" },
  { key: "authors.mergeConfirmButton", cs: "Sloučit", en: "Merge" },
  { key: "participantFieldAdmin.confirmRenameButton", cs: "Přejmenovat", en: "Rename" },
  { key: "billModal.markPaidConfirm", cs: "Označit tuto účtenku jako vyplacenou plátci?", en: "Mark this bill as paid out to the payer?" },
  { key: "billModal.markUnpaidConfirm", cs: "Zrušit u této účtenky označení „vyplaceno“?", en: "Remove the “paid out” mark from this bill?" },
  { key: "billsPage.confirmBulkApprove", cs: "Schválit vybrané účtenky (počet: {count})? Schválení lze vrátit tlačítkem „Znovu otevřít“ na detailu účtenky.", en: "Approve the selected bills (count: {count})? An approval can be undone with “Reopen” on the bill detail." },
  { key: "billsPage.confirmBulkMarkPaid", cs: "Označit vybrané účtenky jako vyplacené (počet: {count})?", en: "Mark the selected bills as paid out (count: {count})?" },
  { key: "billsPage.confirmBulkMarkUnpaid", cs: "Zrušit u vybraných účtenek označení „vyplaceno“ (počet: {count})?", en: "Remove the “paid out” mark from the selected bills (count: {count})?" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let created = 0;
  let filled = 0;
  let untouched = 0;
  for (const row of ROWS) {
    const existing = await prisma.translation.findUnique({ where: { key: row.key } });
    if (!existing) {
      await prisma.translation.create({ data: row });
      created++;
    } else if (!existing.cs.trim() || !existing.en.trim()) {
      await prisma.translation.update({
        where: { key: row.key },
        data: { cs: existing.cs.trim() ? existing.cs : row.cs, en: existing.en.trim() ? existing.en : row.en },
      });
      filled++;
    } else {
      untouched++;
    }
  }
  console.log(`seed-missing-translations: created ${created}, filled empty ${filled}, left as is ${untouched} (of ${ROWS.length})`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
