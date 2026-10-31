// 2026-11-01: Osobní účtenky -- "Načíst znovu AI" on a saved bill. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("personalBills.rescan", "Načíst znovu AI", "Read again with AI"),
  r("personalBills.rescanConfirm", "Položky se načtou znovu a jejich přiřazení lidem se zruší. Pokračovat?", "The lines are read again and their assignments to people are cleared. Continue?"),
  r("personalBills.error.ai_failed", "AI účtenku nepřečetla. Zkuste to znovu.", "AI couldn't read the receipt. Try again."),
  r("personalBills.error.no_file", "Účtenka nemá fotku.", "The bill has no photo."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} personal bills 4 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
