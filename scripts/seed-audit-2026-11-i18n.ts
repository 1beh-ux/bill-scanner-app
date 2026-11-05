// Audit fixes 2026-11-05 (docs/bill-scanner-v2-claude-code-prompt-8-audit-fixes-2026-11-05.md). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  // Phase 2: permissions
  r("eventSettings.adminManaged", "Tohle upravuje správce organizace.", "An organization admin manages this."),
  // Phase 3: bank import window
  r("bankImport.window", "Období akce {from} – {to}", "Event period {from} – {to}"),
  r("bankImport.outsideHint", "{count} řádků je mimo období akce ({from} – {to}), proto se nenačtou. Patří-li k akci, rozšiřte data u propojení účtu nahoře (Období) a náhled spusťte znovu.", "{count} rows are outside the event period ({from} – {to}), so they won't be imported. If they belong to the event, widen the account link's dates above (Period) and run the preview again."),
  // Phase 4: kitchen diet safety
  r("kitchen.dietWarnings.title", "Pozor: v alergiích jsou výrazy, které aplikace nepřiřadila – čtěte text rodičů", "Careful: allergy texts contain words the app couldn't match – read the parents' text"),
  r("kitchen.dietWarnings.chip", "text obsahuje nepřiřazené výrazy: {words}", "the text has unmatched words: {words}"),
  r("kitchen.dietWarnings.unconfirmed", "zatím neověřeno", "not confirmed yet"),
  r("kitchen.dietWarnings.reviewedLabel", "Nepřiřazené výrazy ({words}) jsem posoudil/a", "I've checked the unmatched words ({words})"),
  r("kitchen.dietWarnings.needsReview", "Text obsahuje nepřiřazené výrazy: napište poznámku, nebo zaškrtněte, že jste je posoudil/a.", "The text has unmatched words: write a note, or tick that you've checked them."),
  r("kitchen.dietWarnings.saveFailed", "Uložení se nepodařilo.", "Saving failed."),
  r("kitchen.dietWarnings.reviewedNote", "Nepřiřazené výrazy posouzeny: {note}", "Unmatched words checked: {note}"),
  r("kitchen.dietWarnings.reviewedTick", "Nepřiřazené výrazy posouzeny (zaškrtnuto při potvrzení).", "Unmatched words checked (ticked at confirmation)."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} audit 2026-11 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
