// Registration & membership, slice 4 (docs/registration-slice4-spec.md):
// feedback round 1. Portal/public keys (portal.*, public.*) are read in Czech
// only for now -- they still get an en text. Run after the slice-3 seed (it
// updates portal.uploadDone).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // 6-7. upload review
    { key: "portal.uploadDone", cs: "Nahráno — dokument teď zkontrolujeme.", en: "Uploaded — we'll check the document now." },
    { key: "portal.docInReview", cs: "nahráno, čeká na kontrolu", en: "uploaded, waiting for review" },
    { key: "portal.docRejected", cs: "Zamítnuto: {note} — nahrajte prosím nový.", en: "Rejected: {note} — please upload a new one." },
    { key: "uploadReview.title", cs: "Nahrané dokumenty ke kontrole ({count})", en: "Uploaded documents to review ({count})" },
    { key: "uploadReview.hint", cs: "Dokumenty, které rodiče nahráli v portálu. Do schválení se nepočítají jako přijaté (počty, stav dokumentů, e-maily, tabulka). Nic se neposílá.", en: "Documents parents uploaded in the portal. Until approved they don't count as received (counts, document status, e-mails, sheet). Nothing is e-mailed." },
    { key: "uploadReview.empty", cs: "Nic nečeká na kontrolu.", en: "Nothing is waiting for review." },
    { key: "uploadReview.listLink", cs: "Nahrané dokumenty ke kontrole ({count})", en: "Uploaded documents to review ({count})" },
    { key: "uploadReview.open", cs: "Zobrazit", en: "View" },
    { key: "uploadReview.download", cs: "Stáhnout", en: "Download" },
    { key: "uploadReview.approve", cs: "Schválit", en: "Approve" },
    { key: "uploadReview.reject", cs: "Zamítnout", en: "Reject" },
    { key: "uploadReview.reason", cs: "Důvod (uvidí ho rodiče)", en: "Reason (parents will see it)" },
    { key: "uploadReview.failed", cs: "Nepodařilo se uložit.", en: "Couldn't save." },
    { key: "uploadReview.pendingFrom", cs: "Nahráno v portálu {date} — čeká na kontrolu", en: "Uploaded in the portal {date} — waiting for review" },
    { key: "uploadReview.rejectedNote", cs: "Zamítnuto ({date}): {note}", en: "Rejected ({date}): {note}" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 4 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
