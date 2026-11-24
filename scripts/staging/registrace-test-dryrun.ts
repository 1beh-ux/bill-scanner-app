// STAGING ONLY, writes nothing: how the test member list maps onto the fields of "TEST Členství 2026" and what the
// import would do (planned counts, issues). Column names and keys only.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const fs = await import("node:fs");
  const { prisma } = await import("../../src/lib/prisma");
  const { parseTable } = await import("../../src/lib/planning-import");
  const { guessMappingByLabel: guessMapping, slotMapping, sanitizeSettings } = await import("../../src/lib/participant-sync");
  const { loadImportFields, planFor } = await import("../../src/lib/participant-sync-run");
  const e = await prisma.event.findFirstOrThrow({ where: { name: "TEST Členství 2026" } });
  const [headers, ...rows] = parseTable(fs.readFileSync("docs/test-cases/registrace-2027/clenove-2026.csv", "utf8").replace(/^﻿/, ""));
  const fields = await loadImportFields(e.id);
  const mapping = slotMapping(headers, guessMapping(headers, fields));
  const plan = await planFor(e.id, { headers, rows }, sanitizeSettings({ mapping, onMatch: "fill" }), fields, []);
  const counts: Record<string, number> = {};
  for (const r of plan) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("mapped columns:");
  for (const h of headers) console.log(`  ${h} -> ${mapping[h.trim()] ?? "(nepřevádět)"}`);
  console.log("plan:", JSON.stringify(counts), "| issues:", JSON.stringify(plan.filter((r) => r.errors.length || r.warnings?.length).map((r) => ({ row: r.rowNumber, errors: r.errors, warnings: r.warnings }))));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
