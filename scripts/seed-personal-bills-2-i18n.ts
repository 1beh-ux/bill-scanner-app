// 2026-10-30: Osobní účtenky 2 -- any author through the event, the event's own money, tallies ("čárky");
// the organizers' note on health records. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("incidentForm.internalNoteLabel", "Poznámka pro vedoucí", "Note for the organizers"),
  r("incidentForm.internalNoteHint", "Jen pro vedoucí – neposílá se rodičům ani do PDF", "For the organizers only – never sent to parents or in the PDF"),

  r("personalBills.hint", "Nákupy pro lidi, které nejsou výdajem akce (zmrzlina, pivo, suvenýry…). Nejsou v oficiálních účtenkách, v exportu do účetnictví ani v rozpočtu. Účtenku zaplatil autor (nebo akce) a rozdělí se mezi lidi – rovným dílem, částkami nebo čárkami. Přes akci: akce autorovi proplatí díly ostatních a každému se jeho díl započte na stránce Platby.", "Purchases for people that aren't the event's expense (ice cream, beer, souvenirs…). Not in the official bills, the accounting export or the budget. The author (or the event) paid; the bill is split between people – evenly, by amounts or as a tally. Through the event: the event pays the author back the others' parts and each person's part is netted on Payments."),
  r("personalBills.treasurerHint", "Kdo proplácí účtenky akce – předvyplní se jako autor nové osobní účtenky (u každé jde změnit).", "Who pays out the event's bills – prefilled as the author of a new personal bill (changeable on each)."),
  r("personalBills.debtsHint", "Osobní účtenky vyúčtované mimo akci: vyrovnávají se mezi lidmi napřímo (vzájemné dluhy jsou odečtené).", "Personal bills settled outside the event: directly between people (mutual debts are netted)."),
  r("personalBills.authorEvent", "Akce (peníze akce / pokladna)", "The event (its money / cash box)"),
  r("personalBills.authorEventHint", "Zaplaceno z peněz akce: lidé zaplatí svůj díl akci (započte se s jejich proplacením), nikomu se nic nevrací.", "Paid from the event's money: people pay their part to the event (netted with their payout), nobody is paid back."),
  r("personalBills.viaEvent", "Vyúčtovat přes akci", "Settle through the event"),
  r("personalBills.viaEventHint", "Akce autorovi proplatí díly ostatních (s jeho proplacením) a ostatní zaplatí svůj díl akci (započte se s jejich proplacením).", "The event pays the author back the others' parts (with their payout) and the others pay their part to the event (netted with their payout)."),
  r("personalBills.directHint", "Mimo akci: lidé zaplatí autorovi napřímo (Platby → Osobní dluhy mezi lidmi), akce se nepočítá.", "Outside the event: people pay the author directly (Payments → Personal debts between people); the event isn't involved."),
  r("personalBills.viaEventShort", "přes akci", "through the event"),
  r("personalBills.directShort", "mimo akci", "outside the event"),
  r("personalBills.paidByEvent", "zaplatila akce", "paid by the event"),
  r("personalBills.newTally", "Čárky (pivo, limonáda…)", "Tally (beer, lemonade…)"),
  r("personalBills.tally", "Čárky", "Tally"),
  r("personalBills.itemsTitle", "Ceník čárek", "Tally price list"),
  r("personalBills.itemsHint", "Položky, které se opakují (pivo, limonáda…), se základní cenou za kus. Platí pro celou organizaci; u každých čárek jde cenu změnit.", "Repeated items (beer, lemonade…) with a base price per piece. For the whole organization; each tally can change the price."),
  r("personalBills.itemName", "Položka (např. pivo 0,5 l)", "Item (e.g. beer 0.5 l)"),
  r("personalBills.perPiece", "Kč / ks", "CZK / pc"),
  r("personalBills.tallyItem", "Položka", "Item"),
  r("personalBills.unitPrice", "Cena za kus", "Price per piece"),
  r("personalBills.tallyWho", "Kolik kdo měl:", "Who had how many:"),
  r("personalBills.wizard", "Průvodce po jednom", "One by one"),
  r("personalBills.tallyTotal", "celkem {pieces} ks = {total}", "total {pieces} pcs = {total}"),
  r("personalBills.wizardClear", "vynulovat", "reset"),
  r("personalBills.wizardBack", "Zpět", "Back"),
  r("personalBills.wizardNext", "Další", "Next"),
  r("personalBills.wizardDone", "Hotovo", "Done"),
  r("personalBills.openFile", "Otevřít účtenku", "Open the receipt"),
  r("personalBills.paidForOthers", "zaplatil(a) za ostatní (osobní)", "paid for others (personal)"),
  r("personalBills.ownSpending", "vlastní osobní útraty", "own personal spending"),
  r("personalBills.netTheyPayEvent", "Po započtení zaplatí akci {amount}", "After netting, they pay the event {amount}"),
  r("personalBills.qrToEvent", "QR k zaplacení akci ({name})", "QR to pay the event ({name})"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} personal bills 2 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
