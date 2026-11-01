// 2026-11-02: Vyúčtování wording -- "Zaplaťte X Kč" (not "Zaplaťte akci"). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const rows = [{ key: "settlementPage.youPayEvent", cs: "Zaplaťte {amount}", en: "Pay {amount}" }];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} settlement links 2 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
