// Audit fixes 2026-11-05 (docs/bill-scanner-v2-claude-code-prompt-8-audit-fixes-2026-11-05.md). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  // Phase 2: permissions
  r("eventSettings.adminManaged", "Tohle upravuje správce organizace.", "An organization admin manages this."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} audit 2026-11 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
