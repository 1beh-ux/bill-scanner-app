// 2026-10-22: formatted e-mails and documents attached per e-mail template. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("templateAttachments.title", "Přílohy tohoto e-mailu", "This e-mail's attachments"),
  r("templateAttachments.hint", "Dokumenty akce (Nastavení akce → Dokumenty), které tento e-mail přiloží. Pevná příloha jde všem stejná, ostatní se vytvoří pro každého účastníka z jeho údajů (a uloží se mu jako vygenerovaný dokument). Při odesílání z „Poslat e-mail“ jsou předem zaškrtnuté a jde je změnit.", "The event's documents (Event settings → Documents) this e-mail attaches. A fixed attachment is the same for everyone, the others are generated for each participant from their details (and saved as their generated document). When sending from “Send e-mail” they're pre-ticked and can be changed."),
  r("templateAttachments.none", "Akce zatím nemá žádné dokumenty s Google šablonou.", "The event has no documents with a Google template yet."),
  r("templateAttachments.fixed", "stejná pro všechny", "the same for everyone"),
  r("templateAttachments.generated", "vytvoří se pro každého", "generated for each"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} mail format keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
