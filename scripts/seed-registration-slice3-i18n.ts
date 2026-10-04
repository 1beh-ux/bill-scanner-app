// Registration & membership, slice 3 (docs/registration-slice3-spec.md):
// people (adults too), families, price rules, the public membership form,
// auto-accept, portal v2. Portal/public keys (portal.*, public.*) are read in
// Czech only for now -- they still get an en text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // A. members = people
    { key: "nav.children", cs: "Lidé", en: "People" },
    { key: "children.title", cs: "Lidé", en: "People" },
    { key: "children.intro", cs: "Členové napříč všemi akcemi a roky — děti i dospělí. Účastníci se k osobě propojují podle jména a data narození. Používá se jen u akcí, které mají zapnuté „Připojeno k registraci“ — ostatní akce fungují beze změny.", en: "Members across all events and years — children and adults. Participants are linked by name and birth date. Only used by events with “Connected to registration” on — other events work unchanged." },
    { key: "people.filter", cs: "Zobrazit", en: "Show" },
    { key: "people.filterChildren", cs: "Děti", en: "Children" },
    { key: "people.filterAdults", cs: "Dospělí", en: "Adults" },
    { key: "people.filterAll", cs: "Všichni", en: "Everyone" },
    { key: "people.adult", cs: "dospělý", en: "adult" },
    { key: "people.isAdult", cs: "Dospělý člen (vedoucí, podporovatel…)", en: "Adult member (leader, supporter…)" },

    // B. families
    { key: "families.title", cs: "Rodiny ({count})", en: "Families ({count})" },
    { key: "families.empty", cs: "Zatím žádné rodiny.", en: "No families yet." },
    { key: "families.suggestedTitle", cs: "Navržené rodiny ({count})", en: "Suggested families ({count})" },
    { key: "families.suggestedHint", cs: "Lidé bez rodiny se stejným e-mailem zákonného zástupce. Rodina vznikne, až ji potvrdíte.", en: "People without a family who share a guardian e-mail. A family is only created when you confirm it." },
    { key: "families.name", cs: "Název rodiny", en: "Family name" },
    { key: "families.create", cs: "Vytvořit rodinu", en: "Create family" },
    { key: "families.dissolve", cs: "Zrušit rodinu", en: "Dissolve family" },
    { key: "families.deleteConfirm", cs: "Zrušit rodinu {name}? Lidé zůstanou, jen bez rodiny; rodinný odkaz přestane fungovat.", en: "Dissolve the family {name}? The people stay, just without a family; the family link stops working." },
    { key: "families.removeMember", cs: "Odebrat z rodiny", en: "Remove from family" },
    { key: "families.contacts", cs: "Kontakty", en: "Contacts" },
    { key: "families.addPlaceholder", cs: "Přidat člověka…", en: "Add a person…" },
    { key: "families.mergeInto", cs: "Sloučit s…", en: "Merge with…" },
    { key: "families.mergeConfirm", cs: "Přesunout všechny z rodiny {other} do rodiny {name}? Rodina {other} zanikne i s jejím odkazem.", en: "Move everyone from {other} into {name}? {other} and its link are removed." },
    { key: "families.memberOf", cs: "Rodina: {name}", en: "Family: {name}" },
    { key: "families.childLinkHint", cs: "Patří do rodiny {name} — rodiče běžně dostávají rodinný odkaz (Lidé → Rodiny). Odkaz jen pro tohoto člověka funguje dál.", en: "Belongs to the family {name} — parents normally get the family link (People → Families). A link for just this person keeps working." },
    { key: "portal.gateHint", cs: "Pro otevření portálu zadejte datum narození dítěte (u rodinného odkazu kteréhokoli člena rodiny). Na tomto zařízení se na něj pak už ptát nebudeme.", en: "Enter the child's birth date to open the portal (for a family link, any family member's). This device won't be asked again." },
    { key: "portal.gateLabel", cs: "Datum narození", en: "Birth date" },
    { key: "portal.noEvents", cs: "Teď není otevřená žádná akce, na kterou by šlo přihlásit.", en: "No event is open for registration right now." },

    // C. price rules
    { key: "priceRules.title", cs: "Ceny", en: "Prices" },
    { key: "priceRules.modeSimple", cs: "Jednoduše (člen / nečlen)", en: "Simple (member / non-member)" },
    { key: "priceRules.modeRules", cs: "Pravidla (kategorie, školní rok, sourozenci)", en: "Rules (categories, school year, household)" },
    { key: "priceRules.simpleHint", cs: "Cena podle polí výše: členská / nečlenská. Tak jako dosud.", en: "Price from the fields above: member / non-member. As before." },
    { key: "priceRules.rulesHint", cs: "Cena podle kategorie účastníka. Členská cena platí, když je člověk člen. Od data školního roku platí cena za školní rok (bez slevy). Sleva pro domácnost platí, když je z jedné rodiny přihlášeno aspoň tolik lidí — všem, i zpětně. Cena se počítá vždy aktuálně.", en: "Price by the participant's category. The member price applies to members. From the school-year date the school-year price applies (no discount). The household discount applies when at least that many people of one family are registered — to all of them, retroactively. Prices are always computed live." },
    { key: "priceRules.preset", cs: "Členství (výchozí)", en: "Membership (default)" },
    { key: "priceRules.key", cs: "Klíč", en: "Key" },
    { key: "priceRules.label", cs: "Název kategorie", en: "Category name" },
    { key: "priceRules.price", cs: "Cena", en: "Price" },
    { key: "priceRules.memberPrice", cs: "Členská cena", en: "Member price" },
    { key: "priceRules.schoolYearPrice", cs: "Cena za školní rok", en: "School-year price" },
    { key: "priceRules.householdDiscount", cs: "Sleva domácnost", en: "Household discount" },
    { key: "priceRules.forChildren", cs: "pro děti", en: "for children" },
    { key: "priceRules.forAdults", cs: "pro dospělé", en: "for adults" },
    { key: "priceRules.asksOddil", cs: "ptát se na oddíl", en: "ask for the unit" },
    { key: "priceRules.addCategory", cs: "kategorie", en: "category" },
    { key: "priceRules.schoolYearFrom", cs: "Školní rok od (MM-DD)", en: "School year from (MM-DD)" },
    { key: "priceRules.householdMin", cs: "Sleva od počtu členů domácnosti", en: "Household discount from members" },
    { key: "priceRules.oddilField", cs: "Pole „Oddíl“ (výběr)", en: "“Unit” field (select)" },
    { key: "priceRules.invalid", cs: "Pravidla nejsou platná: každá kategorie potřebuje klíč, název, cenu a aspoň „pro děti“ nebo „pro dospělé“.", en: "The rules aren't valid: every category needs a key, a name, a price and “for children” or “for adults”." },
    { key: "priceRules.previewTitle", cs: "Ukázka cen", en: "Price preview" },
    { key: "priceRules.previewAlone", cs: "sám / sama", en: "alone" },
    { key: "priceRules.previewMember", cs: "člen", en: "member" },
    { key: "priceRules.previewHousehold", cs: "{count} z jedné rodiny", en: "{count} from one family" },
    { key: "priceRules.previewSchoolYear", cs: "přihláška od {date}", en: "registered from {date}" },
    { key: "priceRules.category", cs: "Cenová kategorie", en: "Price category" },
    { key: "priceRules.categoryDefault", cs: "(první povolená)", en: "(first allowed)" },
    { key: "priceRules.changedAfterSend", cs: "cena se změnila po odeslání: {old} → {new} Kč", en: "price changed after sending: {old} → {new} CZK" },
    { key: "portal.priceCategory", cs: "Kategorie", en: "Category" },
    { key: "portal.total", cs: "Celkem: {price} Kč", en: "Total: {price} CZK" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 3 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
