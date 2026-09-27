// Nastavení akce -> Pošta: Gmail label for "done" e-mails.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "mailTab.doneLabel.title", cs: "Štítek pro vyřízené e-maily", en: "Label for done e-mails" },
    { key: "mailTab.doneLabel.hint", cs: "Vyřízené e-maily se přesunou z doručené pošty pod tento štítek v Gmailu schránky akce. Prázdné = MailHelperDone. Lomítko vytvoří vnořený štítek (např. Tábor 2026/Vyřízeno). Pokud štítek neexistuje, vytvoří se při prvním přesunu — nebo ho vytvořte hned tlačítkem.", en: "Done e-mails move out of the inbox under this Gmail label in the event's mailbox. Empty = MailHelperDone. A slash makes a nested label (e.g. Camp 2026/Done). A missing label is created on the first move — or create it now with the button." },
    { key: "mailTab.doneLabel.check", cs: "Zkontrolovat ve schránce", en: "Check in mailbox" },
    { key: "mailTab.doneLabel.create", cs: "Vytvořit štítek", en: "Create label" },
    { key: "mailTab.doneLabel.exists", cs: "Štítek „{name}“ ve schránce {mailbox} existuje.", en: "Label “{name}” exists in {mailbox}." },
    { key: "mailTab.doneLabel.created", cs: "Štítek „{name}“ byl ve schránce {mailbox} vytvořen.", en: "Label “{name}” was created in {mailbox}." },
    { key: "mailTab.doneLabel.missing", cs: "Štítek „{name}“ ve schránce {mailbox} zatím neexistuje (vytvoří se při prvním přesunu).", en: "Label “{name}” doesn't exist in {mailbox} yet (it's created on the first move)." },
    { key: "mailTab.doneLabel.error.sender_not_configured", cs: "Akce nemá nastavenou schránku (Nastavení akce → Připojení).", en: "The event has no mailbox set (Event settings → Connections)." },
    { key: "mailTab.doneLabel.error.gmail_failed", cs: "Schránku se nepodařilo zkontrolovat — je propojená?", en: "Couldn't check the mailbox — is it connected?" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} done-label keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
