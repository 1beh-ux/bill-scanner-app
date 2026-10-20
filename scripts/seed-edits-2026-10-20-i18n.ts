// Edits 2026-10-20: event name + dates in Nastavení akce -> Akce. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("eventBasics.title", "Název a termín", "Name and dates"),
  r("eventBasics.name", "Název akce", "Event name"),
  r("eventBasics.start", "Začátek", "Start"),
  r("eventBasics.end", "Konec", "End"),
  r("eventBasics.hint", "Nový termín se použije v e-mailech, dokumentech a vstupenkách vytvořených od teď; už odeslané zůstávají, jak byly.", "The new dates apply to e-mails, documents and tickets made from now on; ones already sent stay as they were."),
  r("eventBasics.saved", "Uloženo.", "Saved."),
  r("eventBasics.badDates", "Konec nesmí být před začátkem.", "The end can't be before the start."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} edits 2026-10-20 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
