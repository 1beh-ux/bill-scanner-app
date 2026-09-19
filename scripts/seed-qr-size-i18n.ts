// One-off: translations for the QR size setting in the QR field's panel.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "participantFieldAdmin.qrSizeLabel", cs: "Velikost QR kódu v dokumentu (mm)", en: "QR code size in documents (mm)" },
    {
      key: "participantFieldAdmin.qrSizeHint",
      cs: "Strana čtverce, který se vloží na místo proměnné QR. Výchozí je 35 mm; platí pro všechny dokumenty této akce. Povoleno 10–150 mm.",
      en: "Side of the square inserted where the QR variable is. Default is 35 mm; applies to all documents of this event. Allowed 10–150 mm.",
    },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
