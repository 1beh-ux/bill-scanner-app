// 2026-10-29: adults from outside the organization, days at the event; Kuchyně -- the organization's diets,
// "vždy v kuchyni", a second unit, AI guesses in the import. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("people.external", "Mimo organizaci (není člen – kuchař, pomocník…)", "From outside the organization (not a member – cook, helper…)"),
  r("people.externalBadge", "mimo organizaci", "outside the organization"),
  r("people.filterExternal", "Dospělí mimo organizaci", "Adults outside the organization"),
  r("adults.addExternal", "Přidat dospělého mimo organizaci", "Add an adult from outside the organization"),
  r("adults.externalOnly", "Uloží se do Lidí jako dospělý mimo organizaci (není člen). Příště ho najdete v „Přidat z lidí“.", "Saved in People as an adult from outside the organization (not a member). Next time pick them in “Add from People”."),
  r("adults.colDaysAt", "Dny na akci", "Days at the event"),
  r("adults.colPeriods", "Termíny", "Periods"),
  r("adults.wholeEvent", "celá akce", "the whole event"),
  r("adults.daysHint", "Klik = den ano / ne, Shift+klik = celý úsek.", "Click = day on / off, Shift+click = a whole range."),
  r("adults.dropOutside", "Odebrat dny mimo akci ({days})", "Remove days outside the event ({days})"),

  r("kitchen.diets.listTitle", "Diety", "Diets"),
  r("kitchen.diets.listHint", "Diety organizace (vegetarián, bezlepková, bez laktózy…). U každé: slova, podle kterých se pozná v textu rodičů, a co ji porušuje – obsah suroviny (maso, mléčné…) nebo alergeny. Surovinu lze označit „vhodné i pro“ (např. bezlaktózové mléko).", "The organization's diets (vegetarian, gluten-free, lactose-free…). For each: the words that recognise it in parents' texts, and what breaks it – an ingredient's content (meat, dairy…) or allergens. An ingredient can be marked “also fine for” (e.g. lactose-free milk)."),
  r("kitchen.diets.keywords", "Slova v textu rodičů (oddělená čárkou, stačí začátek slova)", "Words in parents' texts (comma separated, the start of a word is enough)"),
  r("kitchen.diets.breaksContents", "Porušuje ji surovina, která obsahuje:", "Broken by an ingredient containing:"),
  r("kitchen.diets.breaksAllergens", "…nebo má alergen:", "…or with the allergen:"),
  r("kitchen.diets.newDiet", "Nová dieta (např. bez ořechů)", "New diet (e.g. no nuts)"),
  r("kitchen.diets.confirmDeleteDiet", "Smazat dietu „{name}“? U lidí, kteří ji mají, se přestane kontrolovat (raději ji vypněte).", "Delete the diet “{name}”? It stops being checked for people who have it (better switch it off)."),
  r("kitchen.ingredient.pantry", "vždy v kuchyni", "always in the kitchen"),
  r("kitchen.ingredient.pantryHint", "(sůl, koření… – v receptu bez přesného množství, v nákupu jen ke kontrole zásob)", "(salt, spices… – no exact amount in recipes, on the shopping list only to check the stock)"),
  r("kitchen.ingredient.altUnit", "Počítat také v:", "Also count in:"),
  r("kitchen.ingredient.altUnitName", "např. stroužek, hrnek", "e.g. clove, cup"),
  r("kitchen.ingredient.altUnitHint", "(1 stroužek = 1 ks, 1 hrnek = 140 g)", "(1 clove = 1 pc, 1 cup = 140 g)"),
  r("kitchen.ingredient.okFor", "Vhodné i pro:", "Also fine for:"),
  r("kitchen.meal.asNeeded", "dle potřeby", "as needed"),
  r("kitchen.meal.aiAllergens", "alergeny podle AI", "allergens by AI"),
  r("kitchen.meal.newDetails", "Nová surovina: alergeny, obsah, jednotka, vždy v kuchyni", "New ingredient: allergens, content, unit, always in the kitchen"),
  r("kitchen.meal.newIngredientShort", "nová surovina", "new ingredient"),
  r("kitchen.import.warn.piece_unit", "počítáno v kusech", "counted in pieces"),
  r("kitchen.import.aiGuesses", "Druh jídla, časy, nádobí, štítky, varianty a u nových surovin alergeny, obsah a „vždy v kuchyni“ navrhla AI – zkontrolujte je.", "Meal type, times, equipment, tags, variants and, for new ingredients, allergens, content and “always in the kitchen” were suggested by AI – check them."),
  r("kitchen.shopping.pantry", "Vždy v kuchyni – zkontrolovat zásoby", "Always in the kitchen – check the stock"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} adults/kitchen 2 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
