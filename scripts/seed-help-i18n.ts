// Nápověda (in-app help) -- UI strings; the topic texts live in src/content/help-topics.ts.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "nav.help", cs: "Nápověda", en: "Help" },
    { key: "help.title", cs: "Nápověda", en: "Help" },
    { key: "help.downloadPdf", cs: "Stáhnout příručku (PDF)", en: "Download the manual (PDF)" },
    { key: "help.link", cs: "Nápověda", en: "Help" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} help keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
