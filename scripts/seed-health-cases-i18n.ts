// 2026-10-29: Zdraví -- "Vyřešeno" on cases, the Aktivní případy page, Excel-like list filters. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("healthCases.title", "Aktivní případy", "Active cases"),
  r("healthCases.hint", "Záznamy, které ještě potřebují pozornost. Až je případ uzavřený, označte ho jako vyřešený – zmizí odsud a v seznamu Zdraví bude šedivě.", "Records that still need attention. Once a case is closed, mark it resolved – it leaves this list and shows grey in the Health list."),
  r("healthCases.status", "Stav", "Status"),
  r("healthCases.statusActive", "Aktivní", "Active"),
  r("healthCases.statusResolved", "Vyřešené", "Resolved"),
  r("healthCases.statusAll", "Všechny", "All"),
  r("healthCases.participant", "Účastník", "Participant"),
  r("healthCases.allParticipants", "Všichni účastníci", "All participants"),
  r("healthCases.new", "Nový záznam", "New record"),
  r("healthCases.pickChild", "Vyberte účastníka…", "Pick a participant…"),
  r("healthCases.continue", "Pokračovat", "Continue"),
  r("healthCases.noneActive", "Žádné aktivní případy.", "No active cases."),
  r("healthCases.none", "Žádné záznamy.", "No records."),
  r("incidentsPage.markResolved", "Vyřešeno", "Resolved"),
  r("incidentsPage.reopen", "Znovu otevřít", "Reopen"),
  r("incidentsPage.resolved", "vyřešeno", "resolved"),
  r("incidentsPage.showResolved", "Zobrazit vyřešené ({n})", "Show resolved ({n})"),
  r("incidentsPage.noActive", "Žádné aktivní záznamy.", "No active records."),
  r("healthPage.incidentsActive", "aktivní", "active"),
  r("healthPage.incidentsResolvedOnly", "jen vyřešené", "resolved only"),
  r("healthPage.incidentsResolved", "vyřešené záznamy", "resolved records"),
  r("healthPage.clearFilters", "Zrušit filtry sloupců ({n})", "Clear column filters ({n})"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} health cases keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
