// 2026-10-23: "Duplikovat akci" wizard, parents' field order, who a public form registers. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const parts: [string, string, string, string, string][] = [
  ["basics", "Základní nastavení", "Místo, informace pro rodiče, dotazník, odesílací schránka, sloupce seznamů a rozvržení, zdravotní poznámky, velikost QR.", "Basic setup", "Place, info for parents, questionnaire, sending mailbox, list columns and layouts, health notes, QR size."],
  ["modules", "Zapnuté moduly", "Které moduly akce používá (Účastníci, Zdraví, Pošta, Plánování…).", "Modules on", "Which modules the event uses (Participants, Health, Mail, Planning…)."],
  ["categories", "Kategorie účtenek a rozpočty", "Kategorie výdajů i s naplánovanými částkami.", "Receipt categories and budgets", "Expense categories with their planned amounts."],
  ["fields", "Pole účastníků", "Která pole se kde ukazují, jejich pořadí a co se vyžaduje při přihlášce.", "Participant fields", "Which fields show where, their order and what's required when registering."],
  ["documents", "Dokumenty a seznamy", "Druhy dokumentů s Google šablonami (přihláška, bezinfekčnost…) a ostatní seznamy akce (místa…).", "Documents and lists", "Document types with Google templates and the event's other lists (places…)."],
  ["emails", "E-maily", "Šablony e-mailů upravené pro akci, vlastní e-maily akce a jejich přílohy (přílohy jen spolu s dokumenty).", "E-mails", "The event's own versions of the e-mail templates, its own e-mails and their attachments (attachments only together with the documents)."],
  ["payment", "Ceny a platba", "Ceny a cenová pravidla, účet pro platby, typ akce ve VS, automatické přijetí, kontrola plateb z Fio.", "Prices and payment", "Prices and price rules, the payment account, the event type in the VS, auto-accept, the Fio payment check."],
  ["registration", "Přihláška a portál", "Text, vzhled, texty a kontakt veřejné přihlášky, propojení s Lidmi, kdo se smí hlásit v portálu. Adresa stránky se nekopíruje a přihláška i portál zůstanou zavřené, dokud je neotevřete.", "Registration and portal", "The public registration's text, look, texts and contact, the link to People, who may register in the portal. The page address isn't copied; registration and portal stay closed until you open them."],
  ["tickets", "Vstupenky", "Nastavení prodeje a šablona vstupenky (druhy a ceny jsou v „Ceny a platba“).", "Tickets", "Sale settings and the ticket template (types and prices are in “Prices and payment”)."],
  ["planning", "Plánování – knihovna aktivit", "Aktivity akce bez dnů a programu.", "Planning – activity library", "The event's activities, without days and the programme."],
  ["access", "Lidé a přístupy", "Kdo má v akci které moduly, a autoři účtenek.", "People and access", "Who has which modules in the event, and the receipt authors."],
  ["drive", "Google Disk a tabulky", "Složky pro účtenky, export a účastníky a připojené tabulky. Vypněte, když chcete napojit jinou tabulku.", "Google Drive and sheets", "Folders for receipts, export and participants, and the connected sheets. Leave off to connect another sheet."],
];

const rows: Row[] = [
  r("duplicate.open", "Duplikovat akci", "Duplicate an event"),
  r("duplicate.title", "Nová akce podle jiné akce", "A new event based on another"),
  r("duplicate.step", "Krok {n} ze 3", "Step {n} of 3"),
  r("duplicate.source", "Podle akce", "Based on"),
  r("duplicate.name", "Název nové akce", "New event name"),
  r("duplicate.partsHint", "Vyberte, co se má zkopírovat. Co nezaškrtnete, nová akce dostane jako obvykle ze šablon organizace.", "Pick what to copy. Anything unticked comes from the organization's templates as usual."),
  r("duplicate.summary", "Z akce „{source}“ vznikne „{name}“ ({from} – {to}) se zkopírovaným:", "From “{source}” comes “{name}” ({from} – {to}) with these copied:"),
  r("duplicate.never", "Nikdy se nekopírují účastníci, účtenky, přijaté dokumenty, objednávky, program plánování ani adresa veřejné přihlášky.", "Never copied: participants, receipts, received documents, orders, the planning programme or the public registration address."),
  r("duplicate.back", "Zpět", "Back"),
  r("duplicate.next", "Pokračovat", "Continue"),
  r("duplicate.create", "Vytvořit akci", "Create the event"),
  r("duplicate.failed", "Akci se nepodařilo vytvořit.", "Couldn't create the event."),
  ...parts.flatMap(([k, cs, csHint, en, enHint]) => [r(`duplicate.part.${k}`, cs, en), r(`duplicate.partHint.${k}`, csHint, enHint)]),
  r("fieldOrder.title", "Pořadí polí pro rodiče", "Field order for parents"),
  r("fieldOrder.open", "Upravit pořadí", "Edit the order"),
  r("fieldOrder.hint", "V tomto pořadí a po těchto částech se pole ukazují v profilu v rodičovském portálu, ve veřejné přihlášce (části organizace jako nadpisy) i při přihlašování na akci. Např. dejte všechna pole adresy do části „Adresa“ za sebe.", "Fields show in this order and these parts in the parent portal profile, the public registration (the organization's parts as headings) and when registering for an event. E.g. put all the address fields together in an “Address” part."),
  r("publicSettings.audience", "Koho lze přihlásit", "Who can be registered"),
  r("publicSettings.audience.children", "Jen děti", "Children only"),
  r("publicSettings.audience.children_adults", "Děti, s nimi i dospělí", "Children, adults with them"),
  r("publicSettings.audience.any", "Děti i samotní dospělí", "Children, and adults on their own"),
  r("public.addAdultWithChild", "Přidat dospělého (s dětmi)", "Add an adult (with the children)"),
  r("public.err.audience_children", "Na tuto akci se hlásí jen děti – odeberte dospělé.", "Only children register for this event – remove the adults."),
  r("public.err.audience_child_needed", "Dospělého lze přihlásit jen spolu s dítětem.", "An adult can only be registered together with a child."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} duplicate/order keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
