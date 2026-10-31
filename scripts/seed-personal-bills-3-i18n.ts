// 2026-10-31: Osobní účtenky 3 -- split by the receipt's lines, "the rest to one person". cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("personalBills.mode.items", "podle položek", "by receipt lines"),
  r("personalBills.lineName", "Položka", "Item"),
  r("personalBills.addLine", "Přidat položku", "Add a line"),
  r("personalBills.addPerson", "kdo", "who"),
  r("personalBills.everyone", "všichni", "everyone"),
  r("personalBills.perPerson", "{amount} na osobu", "{amount} each"),
  r("personalBills.restTo", "Zbytek přiřadit:", "Assign the rest to:"),
  r("personalBills.restAssign", "Přiřadit zbytek ({amount})", "Assign the rest ({amount})"),
  r("personalBills.restLine", "Zbytek účtenky", "Rest of the bill"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} personal bills 3 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
