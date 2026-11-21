// Fields Manager phase 0 (docs/fields-manager-design/plan.md): the four fixed guardian keys become aliases of
// guardian slot 1 for every organization, so the resolver (phase 1) can read old templates through guardian slots.
// Idempotent: existing rows are left alone; a second run creates 0. Nothing reads these rows until phase 1.
//   npx tsx scripts/fields/seed-legacy-aliases.ts            (DATABASE_URL = the target DB, e.g. via run-staging-db.sh)
import { config } from "dotenv";
config({ path: ".env" });

export const LEGACY_GUARDIAN_ALIASES: Record<string, string> = {
  zast_jmeno: "guardian1_name",
  zak_zast_jmeno: "guardian1_name",
  vztah: "guardian1_relation",
  zast_telefon: "guardian1_phone",
};

async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  for (const o of orgs) {
    const res = await prisma.fieldAlias.createMany({
      data: Object.entries(LEGACY_GUARDIAN_ALIASES).map(([alias, targetKey]) => ({
        organizationId: o.id,
        alias,
        targetKind: "guardian" as const,
        targetKey,
        reason: "legacy",
      })),
      skipDuplicates: true,
    });
    created += res.count;
  }
  console.log(`  ok: legacy guardian aliases, ${created} created for ${orgs.length} organizations`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
