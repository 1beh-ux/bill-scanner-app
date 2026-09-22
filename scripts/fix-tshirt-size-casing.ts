// One-off, safe to re-run: normalizes the "Velikost trička" select field's option
// casing to S/M/L/XL/XXL (Part 2 of the participants/settings prompt) -- an
// org admin created this field by hand with whatever casing they typed (it isn't
// in any seed script), so this fixes production data, not seed defaults.
// Matches by label (case-insensitive contains "tričk"), only touches select-type
// fields, and only rewrites options whose lowercase form matches a known size
// (s/m/l/xl/xxl/xs/xxxl) -- anything else is left untouched and printed so it can
// be reviewed by hand.
//
//   npx tsx scripts/fix-tshirt-size-casing.ts            # dry run
//   npx tsx scripts/fix-tshirt-size-casing.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const CANONICAL: Record<string, string> = { xs: "XS", s: "S", m: "M", l: "L", xl: "XL", xxl: "XXL", xxxl: "XXXL" };

function normalize(options: string[]): { options: string[]; changed: boolean } {
  let changed = false;
  const next = options.map((o) => {
    const canonical = CANONICAL[o.trim().toLowerCase()];
    if (canonical && canonical !== o) {
      changed = true;
      return canonical;
    }
    return o;
  });
  return { options: next, changed };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const eventFields = await prisma.eventParticipantField.findMany({
    where: { fieldType: "select", label: { contains: "tričk", mode: "insensitive" } },
    select: { id: true, key: true, options: true, event: { select: { name: true } } },
  });
  let eventChanged = 0;
  for (const f of eventFields) {
    const current = (f.options as string[] | null) ?? [];
    const { options, changed } = normalize(current);
    if (!changed) continue;
    eventChanged++;
    console.log(`  ${apply ? "update" : "would update"}: "${f.key}" on ${f.event.name} -- [${current.join(", ")}] -> [${options.join(", ")}]`);
    if (apply) await prisma.eventParticipantField.update({ where: { id: f.id }, data: { options } });
  }

  const templates = await prisma.participantFieldTemplate.findMany({
    where: { fieldType: "select", label: { contains: "tričk", mode: "insensitive" } },
    select: { key: true, options: true },
  });
  let templateChanged = 0;
  for (const t of templates) {
    const current = (t.options as string[] | null) ?? [];
    const { options, changed } = normalize(current);
    if (!changed) continue;
    templateChanged++;
    console.log(`  ${apply ? "update" : "would update"}: template "${t.key}" -- [${current.join(", ")}] -> [${options.join(", ")}]`);
    if (apply) await prisma.participantFieldTemplate.update({ where: { key: t.key }, data: { options } });
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${eventChanged} event field(s), ${templateChanged} template(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
