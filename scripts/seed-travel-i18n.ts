// Cestovní příkazy (2026-11-03, docs/claude-code-prompt-7-travel-orders.md): rate sets, vehicles, payer links,
// travel orders, the PDF texts. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  // --- navigation
  r("nav.travelRates", "Sazby cestovních náhrad", "Travel allowance rates"),
  r("nav.vehicles", "Vozidla", "Vehicles"),
  r("nav.travelOrders", "Cestovní příkazy", "Travel orders"),

  // --- A2 rate sets
  r("travelRates.title", "Sazby cestovních náhrad", "Travel allowance rates"),
  r("travelRates.hint", "Sazby podle vyhlášek, platné od data. Cesta použije sadu s nejpozdějším datem „platí od“, které není po začátku cesty. Odeslané příkazy mají vlastní kopii hodnot – úprava sady je nezmění.", "Rates from the decrees, valid from a date. A trip uses the set with the latest “valid from” not after its start. Submitted orders keep their own copy – editing a set never changes them."),
  r("travelRates.missingEvent", "Pro akci {name} (začíná {start}) chybí sazby: první sada platí až od {first}. Přidejte sadu platnou od {start} nebo dříve.", "Event {name} (starts {start}) has no rates: the first set is valid only from {first}. Add a set valid from {start} or earlier."),
  r("travelRates.missingAll", "Pro akci {name} (začíná {start}) chybí sazby: organizace nemá žádnou sadu. Přidejte sadu platnou od {start} nebo dříve.", "Event {name} (starts {start}) has no rates: the organization has no set. Add a set valid from {start} or earlier."),
  r("travelRates.orgTitle", "Údaje organizace na cestovním příkazu", "Organization details on the travel order"),
  r("travelRates.orgHint", "Tisknou se v hlavičce příkazu u názvu {name} („IČ: …“) a v „V … dne“.", "Printed in the order header next to {name} (“IČ: …”) and in “V … dne”."),
  r("travelRates.orgAddress", "Adresa organizace", "Organization address"),
  r("travelRates.orgIco", "IČO", "Company ID (IČO)"),
  r("travelRates.orgCity", "Místo pro „V … dne“ (např. Praze)", "Place for “V … dne” (e.g. Praze)"),
  r("travelRates.add", "Nová sada", "New set"),
  r("travelRates.copyLatest", "Zkopírovat z předchozí", "Copy from the previous one"),
  r("travelRates.consumptionTitle", "Výchozí spotřeba (l nebo kWh / 100 km), když auto nemá údaje z TP", "Default consumption (l or kWh / 100 km) when the car has no TP values"),
  r("travelRates.consumptionShort", "Spotřeba (manuál/automat)", "Consumption (manual/auto)"),
  r("travelRates.group.petrol", "Benzín", "Petrol"),
  r("travelRates.group.diesel", "Nafta", "Diesel"),
  r("travelRates.group.electric", "Elektřina", "Electricity"),
  r("travelRates.manual", "manuál", "manual"),
  r("travelRates.auto", "automat", "automatic"),
  r("travelRates.field.validFrom", "Platí od", "Valid from"),
  r("travelRates.field.basePerKm", "Základní náhrada (Kč/km)", "Base rate (CZK/km)"),
  r("travelRates.field.trailerSurchargePct", "Přívěs – zvýšení (%)", "Trailer surcharge (%)"),
  r("travelRates.field.dieselPrice", "Nafta (Kč/l)", "Diesel (CZK/l)"),
  r("travelRates.field.petrol95Price", "Natural 95 (Kč/l)", "Natural 95 (CZK/l)"),
  r("travelRates.field.petrol98Price", "Natural 98 (Kč/l)", "Natural 98 (CZK/l)"),
  r("travelRates.field.electricityPrice", "Elektřina (Kč/kWh)", "Electricity (CZK/kWh)"),
  r("travelRates.field.note", "Zdroj (číslo vyhlášky)", "Source (decree number)"),
  r("travelRates.field.petrol", "spotřeba benzín", "petrol consumption"),
  r("travelRates.field.diesel", "spotřeba nafta", "diesel consumption"),
  r("travelRates.field.electric", "spotřeba elektřina", "electricity consumption"),
  r("travelRates.short.basePerKm", "Kč/km", "CZK/km"),
  r("travelRates.short.trailerSurchargePct", "Přívěs %", "Trailer %"),
  r("travelRates.short.dieselPrice", "Nafta", "Diesel"),
  r("travelRates.short.petrol95Price", "N95", "N95"),
  r("travelRates.short.petrol98Price", "N98", "N98"),
  r("travelRates.short.electricityPrice", "kWh", "kWh"),
  r("travelRates.none", "Zatím žádná sada. Přidejte ji tlačítkem Nová sada.", "No set yet. Add one with New set."),
  r("travelRates.deleteConfirm", "Smazat sadu platnou od {date}? Odeslané příkazy si hodnoty nechají; koncepty a nové příkazy ji už nepoužijí.", "Delete the set valid from {date}? Submitted orders keep their values; drafts and new orders won't use it any more."),
  r("travelRates.error.validFromTaken", "Sada s tímto datem „platí od“ už existuje. Upravte ji, nebo zvolte jiné datum.", "A set with this “valid from” date already exists. Edit it, or choose another date."),
  r("travelRates.error.bad", "Zkontrolujte: {fields} (čísla s desetinnou tečkou nebo čárkou, datum).", "Check: {fields} (numbers with a decimal point or comma, the date)."),
  r("travelRates.error.generic", "Uložení se nepodařilo. Zkuste to znovu.", "Saving failed. Try again."),

  // --- A3 vehicles
  r("vehicles.title", "Vozidla", "Vehicles"),
  r("vehicles.hint", "Vlastní auta řidičů pro cestovní příkazy. Majitel je dospělý v Lidech nebo plátce. SPZ a jména jsou osobní údaje – nezadávejte nic navíc. Auto použité v příkazu se nemaže, jen archivuje.", "Drivers' own cars for travel orders. The owner is an adult in People or a payer. Plates and names are personal data – enter nothing more. A car used on an order is never deleted, only archived."),
  r("vehicles.add", "Přidat vozidlo", "Add a vehicle"),
  r("vehicles.search", "Hledat (majitel, auto, SPZ)", "Search (owner, car, plate)"),
  r("vehicles.showArchived", "i archivovaná", "archived too"),
  r("vehicles.none", "Žádné vozidlo.", "No vehicle."),
  r("vehicles.archived", "archivováno", "archived"),
  r("vehicles.archive", "Archivovat", "Archive"),
  r("vehicles.restore", "Obnovit", "Restore"),
  r("vehicles.archiveConfirm", "Archivovat {label}? Nové příkazy ho nenabídnou, staré zůstanou beze změny.", "Archive {label}? New orders won't offer it; old ones stay unchanged."),
  r("vehicles.fromTp", "z TP", "from TP"),
  r("vehicles.fromTable", "tabulka", "table"),
  r("vehicles.tpHint", "Spotřeba z technického průkazu (l/100 km), až 4 hodnoty; použije se průměr vyplněných. Bez nich platí tabulka sazeb.", "Consumption from the technical licence (l/100 km), up to 4 values; the average of those filled in is used. Without them, the rate table applies."),
  r("vehicles.privacyHint", "Zadávejte jen údaje potřebné pro příkaz.", "Enter only what the order needs."),
  r("vehicles.field.label", "Vozidlo (značka, model)", "Vehicle (make, model)"),
  r("vehicles.field.plate", "SPZ", "Plate"),
  r("vehicles.field.cylinderCc", "Obsah válců (cm³)", "Engine size (cm³)"),
  r("vehicles.field.fuel", "Palivo", "Fuel"),
  r("vehicles.field.gearbox", "Převodovka", "Gearbox"),
  r("vehicles.field.tpConsumption", "Spotřeba z TP", "TP consumption"),
  r("vehicles.field.ownerChild", "Majitel – dospělý v Lidech", "Owner – adult in People"),
  r("vehicles.field.ownerAuthor", "Majitel – plátce", "Owner – payer"),
  r("vehicles.field.ownerName", "Majitel – jen jméno (když není v Lidech ani mezi plátci)", "Owner – name only (when in neither People nor payers)"),
  r("vehicles.field.owner", "majitel", "owner"),
  r("vehicles.field.consumption", "Spotřeba", "Consumption"),
  r("vehicles.fuel.diesel", "Nafta", "Diesel"),
  r("vehicles.fuel.petrol95", "Natural 95", "Natural 95"),
  r("vehicles.fuel.petrol98", "Natural 98", "Natural 98"),
  r("vehicles.fuel.electric", "Elektřina", "Electricity"),
  r("vehicles.gearbox.manual", "Manuální", "Manual"),
  r("vehicles.gearbox.automatic", "Automatická", "Automatic"),
  r("vehicles.error.bad", "Zkontrolujte: {fields}.", "Check: {fields}."),
  r("vehicles.error.forbidden", "Toto vozidlo může upravit jen ten, kdo ho přidal, nebo správce organizace.", "Only whoever added this vehicle, or an organization admin, can edit it."),
  r("vehicles.error.generic", "Uložení se nepodařilo. Zkuste to znovu.", "Saving failed. Try again."),
  r("vehicles.count.one", "{count} vozidlo", "{count} vehicle"),
  r("vehicles.count.few", "{count} vozidla", "{count} vehicles"),
  r("vehicles.count.many", "{count} vozidel", "{count} vehicles"),

  // --- A3 payer <-> adult
  r("payerLink.button", "Dospělý a kontakt", "Adult and contact"),
  r("payerLink.title", "Propojit s dospělým", "Link to an adult"),
  r("payerLink.linked", "Propojeno s: {name}", "Linked to: {name}"),
  r("payerLink.open", "otevřít v Lidech", "open in People"),
  r("payerLink.unlink", "zrušit propojení", "unlink"),
  r("payerLink.sameName", "V Lidech je dospělý se stejným jménem ({name}) – propojte místo zakládání duplicity.", "People has an adult with the same name ({name}) – link instead of creating a duplicate."),
  r("payerLink.link", "Propojit", "Link"),
  r("payerLink.hint", "Propojení je jen odkaz (nic se neslučuje): cestovní příkaz pak nabídne jednoho člověka a jeho auta.", "The link is only a reference (nothing is merged): the travel order then offers one person and their cars."),
  r("payerLink.contactTitle", "Kontakt pro cestovní příkazy", "Contact for travel orders"),
  r("payerLink.phone", "Telefon", "Phone"),
  r("payerLink.address", "Adresa", "Address"),
  r("payerLink.contactHint", "Jen když plátce není propojen s dospělým (jinak se bere z Lidí). Telefon se uloží jako +420 xxx xxx xxx.", "Only when the payer isn't linked to an adult (otherwise taken from People). The phone is stored as +420 xxx xxx xxx."),
  r("payerLink.error", "Nepodařilo se uložit.", "Could not save."),
  r("payerLink.adultLinked", "Plátce: {names}.", "Payer: {names}."),
  r("payerLink.adultNotLinked", "Není propojen s plátcem.", "Not linked to a payer."),
  r("payerLink.adultVehicles", "Vozidla: {names}", "Vehicles: {names}"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} travel keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
