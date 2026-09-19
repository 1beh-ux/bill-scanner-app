// One-off: translations for the document-template preview/check page and its
// entry links next to the template setting.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "templatePreview.button", cs: "Náhled a kontrola", en: "Preview & check" },
    { key: "templatePreview.title", cs: "Náhled a kontrola šablony", en: "Template preview & check" },
    { key: "templatePreview.back", cs: "Zpět na nastavení akce", en: "Back to event settings" },
    { key: "templatePreview.openInDocs", cs: "Otevřít v Google Docs", en: "Open in Google Docs" },
    { key: "templatePreview.participant", cs: "Účastník:", en: "Participant:" },
    { key: "templatePreview.shuffle", cs: "Náhodný", en: "Random" },
    { key: "templatePreview.refresh", cs: "Obnovit", en: "Refresh" },
    { key: "templatePreview.hint", cs: "Nic se neukládá ani neodesílá. Šablonu upravte v Google Docs a klikněte na Obnovit.", en: "Nothing is saved or sent. Edit the template in Google Docs, then hit Refresh." },
    { key: "templatePreview.noParticipants", cs: "Akce zatím nemá žádné účastníky, na kterých by šlo šablonu vyzkoušet.", en: "This event has no participants to try the template on yet." },
    { key: "templatePreview.generating", cs: "Vytvářím náhled (pár vteřin)…", en: "Generating preview (a few seconds)…" },
    { key: "templatePreview.pdfFailed", cs: "Náhled se nepodařilo vytvořit (přístup k šabloně? odkaz?).", en: "Couldn't generate the preview (template access? link?)." },
    { key: "templatePreview.variables", cs: "Použité proměnné", en: "Variables used" },
    { key: "templatePreview.imageValue", cs: "[obrázek]", en: "[image]" },
    { key: "templatePreview.summary", cs: "{total} proměnných, k řešení: {problems}", en: "{total} variables, {problems} to fix" },
    { key: "templatePreview.unusedTitle", cs: "Pole zapnutá pro dokumenty, která tato šablona nepoužívá:", en: "Fields enabled for documents that this template doesn't use:" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
