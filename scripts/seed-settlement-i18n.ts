// Settlement with the organization (payer flags, deposits, Vyúčtování, manifest Souhrn + layout)
// and the public pages' theme / background / width.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // Plátci
    { key: "authors.official", cs: "Oficiální účet organizace", en: "Organization's official account" },
    { key: "authors.officialHint", cs: "Účtenky tohoto plátce jsou zaplacené přímo z oficiálního účtu organizace: nic se neproplácí a ve vyúčtování se počítají jako placené organizací. Jeho účet se použije pro vrácení zálohy.", en: "This payer's bills were paid directly from the organization's official account: nothing is paid out, and the settlement counts them as paid by the organization. Its account is used for returning the deposit." },
    { key: "authors.payout", cs: "Řeší se proplacení", en: "Payout handled" },
    { key: "authors.payoutHint", cs: "Vypnuto = tomuto plátci se nic neproplácí (jako „Akce“), u jeho účtenek se nesleduje „Proplaceno“.", en: "Off = nothing is paid out to this payer (like “Event”); “Paid out” isn't tracked for their bills." },
    { key: "billsPage.bulkErrNoPayout", cs: "{filename}: plátci se neproplácí", en: "{filename}: this payer isn't paid out" },
    // Manifest
    { key: "manifestMode.label", cs: "Kategorie v manifestu", en: "Categories in the manifest" },
    { key: "manifestMode.pairs", cs: "Dvojice sloupců (Kategorie 1, Částka kat. 1, …)", en: "Column pairs (Category 1, Amount 1, …)" },
    { key: "manifestMode.columns", cs: "Sloupec pro každou kategorii (název = kategorie, jen částky)", en: "One column per category (named by it, amounts only)" },
    { key: "manifestMode.hint", cs: "Druhý list „Souhrn“ obsahuje rozpočet po kategoriích, placení z oficiálního účtu a hotově, zálohy a vyúčtování s organizací.", en: "The second sheet “Souhrn” has the budget per category, official-account vs cash payments, the deposits and the settlement." },
    // Rozpočet: Zálohy
    { key: "deposits.title", cs: "Zálohy od organizace", en: "Deposits from the organization" },
    { key: "deposits.hint", cs: "Peníze, které organizace poslala akci. Ve vyúčtování se porovnají s tím, co akce zaplatila hotově.", en: "Money the organization sent to the event. The settlement compares it with what the event paid in cash." },
    { key: "deposits.amount", cs: "Částka (Kč)", en: "Amount (CZK)" },
    { key: "deposits.date", cs: "Datum přijetí", en: "Received on" },
    { key: "deposits.note", cs: "Poznámka", en: "Note" },
    { key: "deposits.add", cs: "Přidat zálohu", en: "Add deposit" },
    { key: "deposits.failed", cs: "Zálohu se nepovedlo uložit (zkontrolujte částku a datum).", en: "Couldn't save the deposit (check the amount and date)." },
    { key: "deposits.deleteConfirm", cs: "Smazat zálohu {amount}?", en: "Delete the deposit {amount}?" },
    // Rozpočet: Vyúčtování
    { key: "settlement.title", cs: "Vyúčtování s organizací", en: "Settlement with the organization" },
    { key: "settlement.approvedOnly", cs: "Jen schválené účtenky (jako v manifestu)", en: "Approved bills only (as in the manifest)" },
    { key: "settlement.hint", cs: "Z oficiálního účtu = účtenky bez plátce (Akce) a plátce označený jako oficiální účet organizace; hotově = vše ostatní.", en: "Official account = bills without a payer (Event) and the payer marked as the organization's official account; cash = everything else." },
    { key: "settlement.includesNotApproved", cs: "Započteno i {count} neschválených účtenek.", en: "Includes {count} bills not approved yet." },
    { key: "settlement.budget", cs: "Rozpočet celkem", en: "Total budget" },
    { key: "settlement.spent", cs: "Utraceno", en: "Spent" },
    { key: "settlement.official", cs: "Zaplaceno z oficiálního účtu", en: "Paid from the official account" },
    { key: "settlement.cash", cs: "Zaplaceno hotově (akcí)", en: "Paid in cash (by the event)" },
    { key: "settlement.cashTitle", cs: "Vyrovnání hotovosti", en: "Cash settlement" },
    { key: "settlement.deposits", cs: "Zálohy", en: "Deposits" },
    { key: "settlement.paidCash", cs: "Zaplaceno hotově", en: "Paid in cash" },
    { key: "settlement.toReturn", cs: "Vrátit organizaci", en: "Return to the organization" },
    { key: "settlement.orgOwes", cs: "Organizace doplatí akci", en: "The organization owes the event" },
    { key: "settlement.qrAlt", cs: "QR platba pro vrácení zálohy", en: "QR payment returning the deposit" },
    { key: "settlement.returnTo", cs: "Vrátit na účet: {name}", en: "Return to: {name}" },
    { key: "settlement.noOfficial", cs: "Pro QR kód označte v Plátcích oficiální účet organizace (s číslem účtu).", en: "For a QR code, mark the organization's official account in Payers (with its account number)." },
    { key: "settlement.noOfficialLink", cs: "Otevřít Plátce", en: "Open Payers" },
    { key: "settlement.colSpent", cs: "Utraceno", en: "Spent" },
    { key: "settlement.colOfficial", cs: "Z oficiálního účtu", en: "Official account" },
    { key: "settlement.colCash", cs: "Hotově", en: "Cash" },
    { key: "settlement.noCategory", cs: "Bez kategorie", en: "No category" },
    // Vzhled veřejných stránek
    { key: "appearance.theme", cs: "Barevný režim", en: "Colour mode" },
    { key: "appearance.themeSystem", cs: "Podle zařízení návštěvníka", en: "The visitor's device setting" },
    { key: "appearance.theme.light", cs: "Světlý", en: "Light" },
    { key: "appearance.theme.dark", cs: "Tmavý", en: "Dark" },
    { key: "appearance.themeHint", cs: "Vložené na webu platí vždy; na vlastní stránce jen dokud si návštěvník nepřepne sám.", en: "Always applies when embedded; on its own page until the visitor switches." },
    { key: "appearance.transparent", cs: "Bez pozadí", en: "No background" },
    { key: "appearance.transparentHint", cs: "Stránka i karty jsou průhledné, prosvítá pozadí webu, kam je vložená. Pole formuláře si pozadí nechají.", en: "The page and cards are transparent, so the embedding website's background shows. Form fields keep theirs." },
    { key: "appearance.width", cs: "Šířka obsahu", en: "Content width" },
    { key: "appearance.widthDefault", cs: "Výchozí", en: "Default" },
    { key: "appearance.widthFull", cs: "Celá šířka (100 %)", en: "Full width (100%)" },
    { key: "appearance.widthPx", cs: "Vlastní (px)", en: "Custom (px)" },
    { key: "appearance.widthHint", cs: "Nejvýš tak široký bude formulář / portál ({min}–{max} px). Celá šířka = podle rámečku na webu.", en: "The form / portal is at most this wide ({min}–{max} px). Full width = the frame on the website." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} settlement keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
