// One-off: translations for regenerating documents without email, the
// participant Drive-folder button, and a neutral document-failure message.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "composeEmailModal.titleRegenerate", cs: "Znovu vytvořit dokumenty", en: "Regenerate documents" },
    { key: "composeEmailModal.sendEmailLabel", cs: "Odeslat e-mail rodičům", en: "Send the email to guardians" },
    { key: "composeEmailModal.generateButton", cs: "Vytvořit dokumenty ({count})", en: "Create documents ({count})" },
    { key: "composeEmailModal.docsRegenerated", cs: "Dokumenty vytvořeny ({count}), e-mail nebyl odeslán.", en: "Documents created ({count}), no email sent." },
    { key: "composeEmailModal.docsFailed", cs: "Nepodařilo se vytvořit: {docs}.", en: "Couldn't create: {docs}." },
    { key: "participantsPage.regenerateHint", cs: "Kliknutím znovu vytvoříte dokumenty (e-mail odeslat nemusíte)", en: "Click to regenerate documents (sending the email is optional)" },
    { key: "participantDetail.openDriveFolder", cs: "Otevřít složku ve Disku", en: "Open Drive folder" },
    { key: "participantDetail.driveFolderNotSet", cs: "Složka účastníků není nastavena (nastavení akce → Disk).", en: "No participants folder set (event settings → Drive)." },
    { key: "participantDetail.driveFolderFailed", cs: "Složku se nepodařilo otevřít.", en: "Couldn't open the folder." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
