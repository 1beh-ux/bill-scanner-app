// Registration & membership, slice 2 (docs/registration-portal-spec.md): child
// profiles, pending changes, portal link e-mails, eligibility, the parent portal.
// The portal is Czech only for now -- its keys (portal.*) still get an en text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // A. membership shown from the membership event
    { key: "membershipField.yes", cs: "Ano", en: "Yes" },
    { key: "membershipField.confirmedHint", cs: "potvrzené členství {year}", en: "confirmed membership {year}" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration portal keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
