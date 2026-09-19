// One-off: translations for the template check, the participants folder
// setting and the send-result notice.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "templateCheck.button", cs: "Zkontrolovat šablony", en: "Check templates" },
    { key: "templateCheck.title", cs: "Kontrola šablon dokumentů", en: "Document template check" },
    { key: "templateCheck.failed", cs: "Kontrolu se nepodařilo provést.", en: "The check failed." },
    { key: "templateCheck.noTemplates", cs: "Žádný typ dokumentu nemá nastavenou šablonu.", en: "No document type has a template set." },
    { key: "templateCheck.readFailed", cs: "Šablonu se nepodařilo přečíst (odkaz / přístup?).", en: "Couldn't read the template (link / access?)." },
    { key: "templateCheck.noPlaceholders", cs: "V šabloně nejsou žádné proměnné {{...}}.", en: "No {{...}} variables in this template." },
    { key: "templateCheck.status.ok", cs: "napojeno", en: "mapped" },
    { key: "templateCheck.status.field_off", cs: "pole existuje, ale není zapnuté pro dokumenty", en: "field exists but isn't enabled for documents" },
    { key: "templateCheck.status.unknown", cs: "není namapováno", en: "not mapped" },
    { key: "templateCheck.status.invalid", cs: "neplatný název (jen písmena, čísla, _)", en: "invalid name (letters, digits, _ only)" },
    { key: "templateCheck.hasSpaces", cs: "mezery uvnitř {{ }} -- nebude nahrazeno", en: "spaces inside {{ }} -- won't be replaced" },
    { key: "templateCheck.unusedTitle", cs: "Pole zapnutá pro dokumenty, která žádná šablona nepoužívá:", en: "Fields enabled for documents that no template uses:" },
    { key: "templateCheck.addHint", cs: "Zapne existující pole, nebo vytvoří nové textové pole.", en: "Enables an existing field, or creates a new text field." },
    { key: "templateCheck.addSelected", cs: "Přidat vybrané ({count})", en: "Add selected ({count})" },
    { key: "templateCheck.applied", cs: "Hotovo: zapnuto {enabled}, vytvořeno {created}.", en: "Done: enabled {enabled}, created {created}." },
    { key: "driveSettings.participantsFolderLabel", cs: "Složka účastníků (dokumenty po dětech)", en: "Participants folder (documents per child)" },
    {
      key: "driveSettings.participantsFolderHint",
      cs: "Sem se ukládají složky jednotlivých účastníků s jejich dokumenty -- vygenerované dokumenty se nahrají hned při odeslání. Prázdné = použije se složka pro export.",
      en: "Each participant gets a subfolder here with their documents -- generated documents are uploaded right when the email is sent. Empty = the export folder is used.",
    },
    { key: "composeEmailModal.sendFailed", cs: "Odeslání se nezdařilo.", en: "Sending failed." },
    {
      key: "composeEmailModal.docsFailed",
      cs: "Dokumenty se nepodařilo vygenerovat: {docs} -- e-mail odešel bez nich.",
      en: "Couldn't generate documents: {docs} -- the email went out without them.",
    },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
