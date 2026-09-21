// One-off, idempotent: failed bills created before the change keep the AI's raw
// English text in their user-visible note. This rewrites those notes to the human
// Czech message (the raw text is printed here, and the full AI response stays in
// Bill.aiRawResponse).
//
//   npx tsx scripts/fix-failed-bill-notes.ts            # dry run (default)
//   npx tsx scripts/fix-failed-bill-notes.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { humanAiFailureNote } = await import("../src/lib/ai-failure-note");

  const bills = await prisma.bill.findMany({ where: { status: "failed", notes: { not: null } }, select: { id: true, notes: true, originalFilename: true } });
  let changed = 0;
  for (const b of bills) {
    const next = humanAiFailureNote(b.notes);
    if (next === b.notes) continue;
    changed++;
    console.log(`  ${apply ? "rewrite" : "would rewrite"} ${b.originalFilename}\n      was: ${b.notes}`);
    if (apply) await prisma.bill.update({ where: { id: b.id }, data: { notes: next } });
  }
  console.log(`${apply ? "Rewrote" : "Would rewrite"} ${changed} of ${bills.length} failed bill note(s).${apply ? "" : " Re-run with --apply."}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
