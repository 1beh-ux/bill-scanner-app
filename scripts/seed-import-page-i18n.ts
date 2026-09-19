// One-off: translation keys for the Drive-import empty-result message and the
// merge-selected-bills button on the import page.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows = [
    {
      key: "importPage.driveNothingNew",
      cs: "Na Disku nebylo nalezeno nic nového (již importováno: {already}, přeskočeno Google dokumentů: {native}).",
      en: "Nothing new found in Drive (already imported: {already}, Google-native files skipped: {native}).",
    },
    { key: "importPage.mergeSelected", cs: "Sloučit vybrané ({count}) do jednoho dokladu", en: "Merge selected ({count}) into one bill" },
    { key: "importPage.mergeFailed", cs: "Sloučení se nezdařilo.", en: "Merging failed." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
