// 2026-10-28: Dospělí na akci (adults in Lidé, assigning them to events, the report) + the Kuchyně module name. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("accessTab.moduleKitchen", "Kuchyně", "Kitchen"),
  r("adults.navTitle", "Dospělí na akci", "Adults at the event"),
  r("adults.pageHint", "Vedoucí, pomocníci a kuchaři z Lidí, kteří jsou na akci – kdy a jestli tu jedí. Nejsou to účastníci: žádná přihláška, portál ani e-maily.", "Leaders, helpers and cooks from People who are at the event – when, and whether they eat here. They aren't participants: no registration, portal or e-mails."),
  r("adults.tab.list", "Seznam", "List"),
  r("adults.tab.report", "Report pro dotace", "Report for subsidies"),
  r("adults.count.one", "dospělý", "adult"),
  r("adults.count.few", "dospělí", "adults"),
  r("adults.count.many", "dospělých", "adults"),
  r("adults.addFromPeople", "Přidat z lidí", "Add from People"),
  r("adults.addNew", "Přidat nového dospělého", "Add a new adult"),
  r("adults.addNewAdminOnly", "Nového dospělého přidá správce organizace.", "An organization admin adds a new adult."),
  r("adults.empty", "Na akci zatím nejsou žádní dospělí.", "No adults at the event yet."),
  r("adults.noAccess", "Na tuto stránku je potřeba modul Kuchyně.", "This page needs the Kitchen module."),
  r("adults.colName", "Jméno", "Name"),
  r("adults.colLabel", "Role", "Role"),
  r("adults.labelPlaceholder", "vedoucí, kuchař…", "leader, cook…"),
  r("adults.colAgeStart", "Věk na začátku", "Age at the start"),
  r("adults.colFrom", "Od", "From"),
  r("adults.colTo", "Do", "To"),
  r("adults.colEats", "Jí na místě", "Eats here"),
  r("adults.colAgeOn", "Věk k datu", "Age on"),
  r("adults.colDays", "Dní", "Days"),
  r("adults.remove", "Odebrat z akce", "Remove from the event"),
  r("adults.confirmRemove", "Odebrat {name} z akce? V Lidech zůstane.", "Remove {name} from the event? They stay in People."),
  r("adults.outsideEvent", "Mimo termín akce", "Outside the event's dates"),
  r("adults.datesHint", "Prázdné datum = podle akce ({from} – {to}).", "An empty date = the event's ({from} – {to})."),
  r("adults.noAdultsInPeople", "V Lidech nejsou žádní dospělí – správce je přidá v Lidech (Přidat dospělého).", "There are no adults in People – an admin adds them in People (Add an adult)."),
  r("adults.alreadyHere", "už na akci", "already here"),
  r("adults.addPicked", "Přidat vybrané ({n})", "Add the picked ones ({n})"),
  r("adults.ageFrom", "Věk od", "Age from"),
  r("adults.ageTo", "Věk do", "Age to"),
  r("adults.csv", "Stáhnout CSV", "Download CSV"),
  r("adults.totals", "Celkem {people} lidí, {days} osobodní", "In total {people} people, {days} person-days"),
  r("adults.totalsRange", "ve zvoleném věku {n} lidí, {days} osobodní", "in the chosen age {n} people, {days} person-days"),
  r("adults.reportHint", "Dní = dny na akci včetně prvního a posledního, ořezané na termín akce. Report nepočítá částky, jen dává podklady.", "Days = days at the event including the first and last, clipped to the event's dates. The report computes no amounts, it only gives the facts."),
  r("adults.firstName", "Jméno", "First name"),
  r("adults.lastName", "Příjmení", "Last name"),
  r("adults.dateOfBirth", "Datum narození", "Date of birth"),
  r("adults.street", "Ulice a č. p.", "Street and number"),
  r("adults.municipality", "Obec", "Municipality"),
  r("adults.zip", "PSČ", "Postcode"),
  r("adults.allergens", "Alergeny", "Allergens"),
  r("adults.diet", "Dietní omezení", "Diet restrictions"),
  r("adults.dietNote", "Poznámka k dietě", "Diet note"),
  r("adults.createButton", "Přidat dospělého", "Add an adult"),
  r("adults.createTitle", "Přidat dospělého", "Add an adult"),
  r("adults.createHint", "Vedoucí, pomocník nebo kuchař – bez přihlášky, rodiny a portálu.", "A leader, helper or cook – without a registration, family or portal."),
  r("adults.createSave", "Uložit", "Save"),
  r("adults.createFailed", "Uložit se nepovedlo – vyplňte aspoň jméno nebo příjmení.", "Saving failed – fill in at least a first or last name."),
  r("adults.foodTitle", "Strava a alergie", "Food and allergies"),
  r("adults.foodHint", "Pro kuchyni: alergeny (14 podle EU), dietní omezení a poznámka.", "For the kitchen: allergens (the 14 EU ones), diet restrictions and a note."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} adults keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
