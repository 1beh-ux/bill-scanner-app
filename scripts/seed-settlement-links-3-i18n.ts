// 2026-11-02: Vyúčtování -- a link to each bill's receipt. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const rows = [{ key: "settlementPage.viewBill", cs: "zobrazit účtenku", en: "view the receipt" }];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} settlement links 3 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
