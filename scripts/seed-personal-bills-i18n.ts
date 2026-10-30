// 2026-10-30: Osobní účtenky -- personal bills split between people, netted with payouts on Platby. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("personalBills.title", "Osobní účtenky", "Personal bills"),
  r("personalBills.hint", "Nákupy pro lidi, které nejsou výdajem akce (zmrzlina, suvenýry…). Nejsou v oficiálních účtenkách, v exportu do účetnictví ani v rozpočtu. Účtenku zaplatil autor a rozdělí se mezi lidi – rovným dílem nebo částkami. Co dluží pokladníkovi, se na stránce Platby odečte od jejich proplacení.", "Purchases for people that aren't the event's expense (ice cream, souvenirs…). Not in the official bills, the accounting export or the budget. The author paid; the bill is split between people – evenly or by amounts. What they owe the treasurer is taken off their payout on Payments."),
  r("personalBills.noAccess", "Na tuto stránku je potřeba přístup k účtenkám akce.", "This page needs access to the event's bills."),
  r("personalBills.treasurer", "Pokladník akce:", "Event treasurer:"),
  r("personalBills.treasurerHint", "Kdo proplácí účtenky akce. Je výchozím autorem osobních účtenek a jeho osobní účtenky se započtou s proplacením.", "Who pays out the event's bills. The default author of personal bills; their personal bills are netted with the payouts."),
  r("personalBills.treasurerShort", "pokladník", "treasurer"),
  r("personalBills.new", "Nová osobní účtenka", "New personal bill"),
  r("personalBills.editTitle", "Upravit osobní účtenku", "Edit the personal bill"),
  r("personalBills.empty", "Zatím žádné osobní účtenky.", "No personal bills yet."),
  r("personalBills.scan", "Nahrát fotku (nepovinné)", "Upload a photo (optional)"),
  r("personalBills.reading", "Čtu účtenku…", "Reading the receipt…"),
  r("personalBills.scanHint", "AI předvyplní obchod, datum a částku; rozdělení zadáte sami.", "AI prefills shop, date and amount; you do the split."),
  r("personalBills.date", "Datum", "Date"),
  r("personalBills.merchant", "Obchod / co", "Shop / what"),
  r("personalBills.merchantPlaceholder", "např. zmrzlina Bistro", "e.g. ice cream Bistro"),
  r("personalBills.amount", "Částka", "Amount"),
  r("personalBills.author", "Zaplatil (autor):", "Paid by (author):"),
  r("personalBills.authorHint", "Komu lidé dluží – QR kódy půjdou na jeho účet.", "Who people owe – QR codes go to their account."),
  r("personalBills.splitBetween", "Rozdělit mezi:", "Split between:"),
  r("personalBills.mode.even", "rovným dílem", "evenly"),
  r("personalBills.mode.custom", "podle částek", "by amounts"),
  r("personalBills.clearPeople", "nikoho", "nobody"),
  r("personalBills.splitComplete", "Rozděleno celých {total}.", "All of {total} is split."),
  r("personalBills.splitProgress", "Rozděleno {assigned} z {total}, zbývá {remaining}.", "Split {assigned} of {total}, {remaining} left."),
  r("personalBills.foreignHint", "(dělí se částka v Kč podle kurzu ČNB)", "(the CZK amount at the ČNB rate is split)"),
  r("personalBills.note", "Poznámka", "Note"),
  r("personalBills.noMerchant", "Osobní účtenka", "Personal bill"),
  r("personalBills.paidBy", "zaplatil(a) {name}", "paid by {name}"),
  r("personalBills.file", "účtenka", "receipt"),
  r("personalBills.notSplit", "nerozděleno: zbývá {remaining}", "not split: {remaining} left"),
  r("personalBills.noRate", "chybí kurz ČNB", "ČNB rate missing"),
  r("personalBills.settledLocked", "Část je už vyrovnaná – nejdřív ji vraťte na stránce Platby.", "A part is already settled – undo it on Payments first."),
  r("personalBills.toOfficial", "Přesunout do oficiálních", "Move to the official bills"),
  r("personalBills.toPersonal", "Přesunout do osobních", "Move to personal bills"),
  r("personalBills.confirmDelete", "Smazat osobní účtenku „{name}“?", "Delete the personal bill “{name}”?"),
  r("personalBills.confirmToOfficial", "Přesunout účtenku mezi oficiální účtenky akce? Rozdělení mezi lidi se zruší a účtenka bude ve stavu Nová (kategorie a schválení).", "Move the bill to the event's official bills? The split goes and the bill is New (categories and approval)."),
  r("personalBills.confirmToPersonal", "Přesunout účtenku mezi osobní účtenky? Zmizí z oficiálních účtenek, exportu i rozpočtu; rozdělíte ji mezi lidi.", "Move the bill to personal bills? It leaves the official bills, the export and the budget; you split it between people."),
  r("personalBills.ownedToTreasurer", "osobní útraty u {name}", "personal spending with {name}"),
  r("personalBills.netPayOut", "Po započtení proplatit {amount}", "After netting, pay out {amount}"),
  r("personalBills.netTheyPay", "Po započtení zaplatí {amount} pokladníkovi {name}", "After netting, they pay {amount} to the treasurer {name}"),
  r("personalBills.netEven", "Po započtení vyrovnáno (0 Kč)", "After netting, even (0 CZK)"),
  r("personalBills.qrToTreasurer", "QR k zaplacení pokladníkovi {name}", "QR to pay the treasurer {name}"),
  r("personalBills.debtsTitle", "Osobní dluhy mezi lidmi", "Personal debts between people"),
  r("personalBills.debtsHint", "Osobní účtenky, které nezaplatil pokladník: vyrovnávají se mezi lidmi napřímo (vzájemné dluhy jsou odečtené).", "Personal bills the treasurer didn't pay: settled directly between people (mutual debts are netted)."),
  r("personalBills.debtLine", "{debtor} dluží {creditor} {amount}", "{debtor} owes {creditor} {amount}"),
  r("personalBills.settle", "Vyrovnáno", "Settled"),
  r("personalBills.settleConfirm", "{debtor} zaplatil(a) {creditor} {amount}?", "Did {debtor} pay {creditor} {amount}?"),
  r("personalBills.error.failed", "Nepovedlo se.", "That failed."),
  r("personalBills.error.bad_request", "Zkontrolujte datum a částku.", "Check the date and amount."),
  r("personalBills.error.author_required", "Vyberte, kdo zaplatil (nebo nastavte pokladníka akce).", "Pick who paid (or set the event's treasurer)."),
  r("personalBills.error.not_found", "Člověk nebo účtenka nebyla nalezena.", "Person or bill not found."),
  r("personalBills.error.duplicate_person", "Člověk je v rozdělení dvakrát.", "A person is in the split twice."),
  r("personalBills.error.no_rate", "Pro tuto měnu a datum zatím není kurz ČNB – rozdělit půjde později.", "No ČNB rate for this currency and date yet – split it later."),
  r("personalBills.error.bad_amount", "Některá částka není číslo.", "An amount isn't a number."),
  r("personalBills.error.over_total", "Části dávají víc než celá účtenka.", "The parts add up to more than the bill."),
  r("personalBills.error.settled_locked", "Část je už vyrovnaná – nejdřív ji vraťte na stránce Platby.", "A part is already settled – undo it on Payments first."),
  r("personalBills.error.event_closed_locked", "Akce je uzavřená.", "The event is closed."),
  r("personalBills.error.bill_approved_locked", "Schválenou účtenku nejdřív znovu otevřete.", "Reopen the approved bill first."),
  r("personalBills.error.bill_processing_locked", "Účtenku ještě zpracovává AI.", "The AI is still processing the bill."),
  r("personalBills.error.bill_paid_locked", "Účtenka už je proplacená nebo exportovaná.", "The bill is already paid out or exported."),
  r("personalBills.error.amount_required", "Účtenka nemá částku.", "The bill has no amount."),
  r("personalBills.error.scan_failed", "Fotku se nepodařilo nahrát.", "The photo couldn't be uploaded."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} personal bills keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
