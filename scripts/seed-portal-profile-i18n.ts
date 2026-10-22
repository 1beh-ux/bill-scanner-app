// Parent portal profile page (2026-10-22): the family overview, the profile page and its sections. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("portal.members", "Členové rodiny", "Family members"),
  r("portal.bornOn", "nar. {date}", "born {date}"),
  r("portal.pendingCount", "čeká na schválení: {n}", "awaiting approval: {n}"),
  r("portal.missingCount", "chybí vyplnit pro přihlášku: {n}", "missing for a registration: {n}"),
  r("portal.openProfile", "Profil a údaje", "Profile and details"),
  r("portal.backToOverview", "Zpět na přehled", "Back to the overview"),
  r("portal.nothingChanged", "Nic se nezměnilo.", "Nothing changed."),
  r("profileSections.title", "Části profilu v rodičovském portálu", "Profile parts in the parent portal"),
  r("profileSections.hint", "Profil člověka v portálu má části Základní a Podrobné údaje (podle úrovně pole). Sem můžete přidat další, např. „Zdravotní údaje“ nebo „Výchovné poznámky“; v tabulce níže pak u pole vyberete, do které části patří. Pole se zaškrtnutím „Na přehledu rodiny“ se ukáže i na hlavní stránce portálu vedle jména a data narození.", "A person's portal profile has the Basic and Detailed parts (by the field's level). Add more here, e.g. “Health details” or “Educational notes”; then pick each field's part in the table below. Fields ticked “On the family overview” also show on the portal's main page next to the name and birth date."),
  r("profileSections.builtIn", "vždy, podle úrovně pole", "always, by the field's level"),
  r("profileSections.add", "Přidat část", "Add a part"),
  r("profileSections.column", "Část v portálu", "Portal part"),
  r("profileSections.byLevel", "Podle úrovně", "By level"),
  r("profileSections.summary", "Na přehledu rodiny", "On the family overview"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} portal profile keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
