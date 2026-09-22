// One-off, safe to re-run: splits Participant.name into firstName/lastName
// for rows that don't have the split yet (Part 1 of the participants/
// settings/Health/Mail prompt). Only touches rows where firstName AND
// lastName are both still null.
//
// Rule: exactly two space-separated tokens, no comma, not ALL-CAPS ->
// firstName = token 1, lastName = token 2. Anything else (0/1 token, 3+
// tokens, a comma, ALL-CAPS) is ambiguous: left as firstName = the whole
// name, lastName = null, and printed separately for manual review -- never
// guessed.
//
//   npx tsx scripts/split-participant-names.ts            # dry run
//   npx tsx scripts/split-participant-names.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

function split(name: string): { firstName: string; lastName: string | null; ambiguous: boolean } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const tokens = trimmed.split(" ").filter(Boolean);
  const looksAllCaps = trimmed === trimmed.toUpperCase() && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(trimmed);
  if (tokens.length === 2 && !trimmed.includes(",") && !looksAllCaps) {
    return { firstName: tokens[0], lastName: tokens[1], ambiguous: false };
  }
  return { firstName: trimmed, lastName: null, ambiguous: true };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const rows = await prisma.participant.findMany({
    where: { firstName: null, lastName: null },
    select: { id: true, name: true, event: { select: { name: true } } },
  });

  let clean = 0;
  const ambiguous: { name: string; event: string }[] = [];

  for (const row of rows) {
    const { firstName, lastName, ambiguous: isAmbiguous } = split(row.name);
    if (isAmbiguous) ambiguous.push({ name: row.name, event: row.event.name });
    else clean++;
    if (apply) {
      await prisma.participant.update({ where: { id: row.id }, data: { firstName, lastName } });
    }
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${rows.length} participant(s) (${clean} clean split, ${ambiguous.length} ambiguous).`);
  if (ambiguous.length > 0) {
    console.log("\nAmbiguous -- firstName set to the whole name, lastName left null, review by hand:");
    for (const a of ambiguous) console.log(`  "${a.name}" (${a.event})`);
  }
  if (!apply) console.log("\nRe-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
