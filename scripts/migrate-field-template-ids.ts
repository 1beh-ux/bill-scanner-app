// Organizations step 4: participant_field_templates.id becomes the primary key and
// key unique per organization (20261014090000 additive -> this script -> 20261014100000 tighten).
// Checks/fixes what the tightening needs:
//   - every row has an id (the additive migration's DB default should have filled them),
//   - source_template_id holds template ids (a key left over from before is converted),
//   - no (organization, key) appears twice (NULL organization = one group).
// npx tsx scripts/migrate-field-template-ids.ts           -- dry run
// npx tsx scripts/migrate-field-template-ids.ts --apply   -- fixes, in one transaction
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; id: string | null; organization_id: string | null; source_template_id: string | null };

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const rows = await prisma.$queryRaw<Row[]>`SELECT key, id, organization_id, source_template_id FROM participant_field_templates`;
  const ids = new Set(rows.map((r) => r.id).filter(Boolean));
  const idByKey = new Map(rows.map((r) => [r.key, r.id]));
  const missingId = rows.filter((r) => !r.id);
  const keySources = rows.filter((r) => r.source_template_id && !ids.has(r.source_template_id));
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const g = `${r.organization_id ?? "(app)"}|${r.key}`;
    groups.set(g, [...(groups.get(g) ?? []), r.key]);
  }
  const duplicates = [...groups.entries()].filter(([, v]) => v.length > 1);

  console.log(`rows: ${rows.length}`);
  console.log(`without id: ${missingId.length}${missingId.length ? ` (${missingId.map((r) => r.key).join(", ")})` : ""}`);
  console.log(`source_template_id holding a key (-> converted to that template's id): ${keySources.length}${keySources.length ? ` (${keySources.map((r) => `${r.key}: ${r.source_template_id}`).join(", ")})` : ""}`);
  console.log(`duplicate (organization, key): ${duplicates.length}${duplicates.length ? ` (${duplicates.map(([g]) => g).join(", ")})` : ""}`);
  if (duplicates.length) {
    process.exitCode = 1;
    return console.log("STOP: duplicates must be resolved by hand before the tightening migration.");
  }
  if (!apply) return console.log("\ndry run -- rerun with --apply");

  await prisma.$transaction(async (tx) => {
    for (const r of missingId) await tx.$executeRaw`UPDATE participant_field_templates SET id = gen_random_uuid()::text WHERE key = ${r.key} AND id IS NULL`;
    for (const r of keySources) {
      const target = idByKey.get(r.source_template_id!) ?? null;
      await tx.$executeRaw`UPDATE participant_field_templates SET source_template_id = ${target} WHERE key = ${r.key}`;
    }
  });
  const after = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM participant_field_templates WHERE id IS NULL`;
  console.log(`\napplied; rows without id now: ${after[0].n}`);
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => { console.error(err); process.exit(1); });
