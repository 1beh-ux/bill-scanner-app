// One-off: pushes the new translation keys from the registration-workflow
// batch (accept/reject status, documents column, compose-email modal) into
// the live translations table. Same pattern as the other seed-*-i18n.ts
// scripts -- prisma/seed.ts only seeds a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "participantsPage.colRegistration", cs: "Registrace", en: "Registration" },
    { key: "participantsPage.colDocuments", cs: "Dokumenty", en: "Documents" },
    { key: "participantsPage.statusAccepted", cs: "Přijato", en: "Accepted" },
    { key: "participantsPage.statusPendingAction", cs: "Čeká — přijmout", en: "Pending — accept" },
    { key: "participantsPage.openBulkStatusButton", cs: "Odesílání pošty", en: "Mail sendout" },
    { key: "participantsPage.bulkAcceptButton", cs: "Přijmout a odeslat", en: "Accept and send" },
    { key: "participantsPage.bulkEmailButton", cs: "Napsat e-mail", en: "Write email" },
    {
      key: "healthTemplatesPage.tabRegistrationEmail",
      cs: "E-mail — přijetí registrace",
      en: "Email — registration acceptance",
    },
    {
      key: "composeEmailModal.titleAcceptance",
      cs: "Přijmout registraci a odeslat e-mail",
      en: "Accept registration and send email",
    },
    { key: "composeEmailModal.titleFreeform", cs: "Napsat e-mail", en: "Write email" },
    {
      key: "composeEmailModal.recipientCount",
      cs: "Příjemci: {count} účastníků (zákonní zástupci)",
      en: "Recipients: {count} participants (guardians)",
    },
    { key: "composeEmailModal.subjectPlaceholder", cs: "Předmět", en: "Subject" },
    { key: "composeEmailModal.bodyPlaceholder", cs: "Text e-mailu…", en: "Email text…" },
    { key: "composeEmailModal.attachmentLabel", cs: "Příloha (nepovinné)", en: "Attachment (optional)" },
    {
      key: "composeEmailModal.variablesHint",
      cs: "Lze použít {{participant_name}}, {{camp_name}}, {{sender_name}}.",
      en: "You can use {{participant_name}}, {{camp_name}}, {{sender_name}}.",
    },
    { key: "composeEmailModal.sendButton", cs: "Odeslat ({count})", en: "Send ({count})" },
    { key: "composeEmailModal.sendDone", cs: "Odesláno {sent}, selhalo {failed}.", en: "Sent {sent}, failed {failed}." },
  ];

  for (const row of rows) {
    await prisma.translation.upsert({
      where: { key: row.key },
      update: { cs: row.cs, en: row.en },
      create: row,
    });
    console.log(`  ok: ${row.key}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
