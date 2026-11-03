// Cestovní příkazy: the default 2026 rate sets for every organization (idempotent: existing validFrom kept).
// npx tsx scripts/seed-travel-rates.ts
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { ensureDefaultTravelRates } = await import("../src/lib/travel-rates-defaults");
  let added = 0;
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const o of orgs) added += await ensureDefaultTravelRates(prisma, o.id);
  console.log(`  ok: travel rate sets, ${added} added for ${orgs.length} organizations`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
