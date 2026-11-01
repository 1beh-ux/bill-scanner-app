// 2026-11-01: Vyúčtování -- a person's settlement link (public page) and its management on Platby. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  // The public page (Czech only is shown there; en kept for the table).
  r("settlementPage.title", "vyúčtování pro {name}", "settlement for {name}"),
  r("settlementPage.notFound", "Odkaz neexistuje nebo byl zrušen.", "The link doesn't exist or was revoked."),
  r("settlementPage.failed", "Nepovedlo se, zkuste to znovu.", "That failed, try again."),
  r("settlementPage.throttled", "Moc pokusů najednou – zkuste to za chvíli.", "Too many attempts – try again in a moment."),
  r("settlementPage.youPayEvent", "Zaplaťte akci {amount}", "Pay the event {amount}"),
  r("settlementPage.eventPaysYou", "Akce vám pošle {amount}", "The event will send you {amount}"),
  r("settlementPage.settled", "Vyrovnáno – děkujeme", "Settled — thank you"),
  r("settlementPage.even", "Nic k zaplacení ani k vrácení", "Nothing to pay or to get back"),
  r("settlementPage.iReceived", "Peníze jsem dostal(a)", "I've received the money"),
  r("settlementPage.receivedConfirmed", "Potvrdili jste příjem {date}", "You confirmed receipt on {date}"),
  r("settlementPage.undo", "vrátit", "undo"),
  r("settlementPage.rowOfficial", "Akce vám dluží za účtenky", "The event owes you for bills"),
  r("settlementPage.rowPaidForOthers", "Zaplatil(a) jste za ostatní", "You paid for others"),
  r("settlementPage.rowOwn", "Vaše osobní útraty", "Your personal spending"),
  r("settlementPage.rowResult", "Výsledek", "Result"),
  r("settlementPage.youOwePerson", "Dlužíte {name} {amount}", "You owe {name} {amount}"),
  r("settlementPage.personOwesYou", "{name} vám dluží {amount}", "{name} owes you {amount}"),
  r("settlementPage.theyClaimPaid", "označil(a) jako zaplacené {date}", "marked as paid on {date}"),
  r("settlementPage.iReceivedFrom", "Od {name} jsem peníze dostal(a)", "I've received it from {name}"),
  r("settlementPage.officialTitle", "Za akci jste zaplatil(a)", "You paid for the event"),
  r("settlementPage.officialHint", "Účtenky, které vám akce proplácí. Do výsledku se počítají schválené a dosud neproplacené.", "Bills the event pays you back. The result counts the approved ones not paid out yet."),
  r("settlementPage.state.waiting", "čeká na schválení", "awaiting approval"),
  r("settlementPage.state.approved", "schváleno", "approved"),
  r("settlementPage.state.paid", "proplaceno", "paid out"),
  r("settlementPage.ownTitle", "Vaše osobní útraty", "Your personal spending"),
  r("settlementPage.evenPart", "díl z {n} (celkem {total})", "a share of {n} (total {total})"),
  r("settlementPage.ownPartMine", "vaše vlastní část", "your own part"),
  r("settlementPage.paidBy", "zaplatil(a) {name}", "paid by {name}"),
  r("settlementPage.paidByEvent", "zaplatila akce", "paid by the event"),
  r("settlementPage.viaEvent", "přes akci", "through the event"),
  r("settlementPage.direct", "napřímo", "directly"),
  r("settlementPage.partSettled", "vyrovnáno", "settled"),
  r("settlementPage.othersTitle", "Zaplatil(a) jste za ostatní", "You paid for others"),
  r("settlementPage.payoutTo", "Na účet", "To the account"),
  r("settlementPage.payoutAccount", "Kam vám poslat peníze:", "Where to send your money:"),
  r("settlementPage.change", "změnit", "change"),
  r("settlementPage.save", "Uložit", "Save"),
  r("settlementPage.noAccount", "{name} zatím nemá zadaný účet – ozvěte se pokladníkovi.", "{name} has no account yet – contact the treasurer."),
  r("settlementPage.to", "Příjemce:", "To:"),
  r("settlementPage.account", "Účet:", "Account:"),
  r("settlementPage.vs", "Variabilní symbol:", "Variable symbol:"),
  r("settlementPage.amount", "Částka:", "Amount:"),
  r("settlementPage.copy", "kopírovat", "copy"),
  r("settlementPage.shareQr", "Uložit / sdílet QR", "Save / share the QR"),
  r("settlementPage.iPaid", "Zaplatil(a) jsem", "I've paid this"),
  r("settlementPage.claimed", "Označeno jako zaplacené {date} – čeká na potvrzení", "Marked as paid on {date} – awaiting confirmation"),
  r("settlementPage.checkPayment", "Zkontrolovat platbu", "Check the payment"),
  r("settlementPage.autoHint", "Platbu s tímto variabilním symbolem banka potvrdí sama (QR ho vyplní). Bez symbolu ji pokladník potvrdí ručně.", "A payment with this variable symbol is confirmed by the bank (the QR fills it in). Without it, the treasurer confirms by hand."),
  r("settlementPage.manualHint", "Po zaplacení klikněte na „Zaplatil(a) jsem“ – příjemce platbu potvrdí.", "After paying, tap “I've paid this” – the recipient confirms it."),
  r("settlementPage.footer", "Údaje se počítají průběžně – když přibude účtenka, změní se i tady.", "Amounts are live – when a bill is added, it shows here too."),

  // Platby
  r("settlementLinks.receiver", "Vyúčtování – lidé platí na:", "Settlement – people pay to:"),
  r("settlementLinks.receiverTreasurer", "účet pokladníka ({name})", "the treasurer's account ({name})"),
  r("settlementLinks.receiverEvent", "účet akce v Bance ({name})", "the event's account in Banka ({name})"),
  r("settlementLinks.noTreasurer", "Nastavte pokladníka akce (Osobní účtenky).", "Set the event's treasurer (Personal bills)."),
  r("settlementLinks.noAccount", "{name} nemá zadaný účet – QR kód nepůjde vytvořit.", "{name} has no account – no QR code can be made."),
  r("settlementLinks.fio", "Fio token pokladníka ({name}):", "The treasurer's Fio token ({name}):"),
  r("settlementLinks.fioSet", "nastaven", "set"),
  r("settlementLinks.fioError", "poslední kontrola: chyba {code}", "last check: error {code}"),
  r("settlementLinks.fioRemove", "odebrat", "remove"),
  r("settlementLinks.fioPlaceholder", "API token z Fio (jen pro čtení)", "Fio API token (read-only)"),
  r("settlementLinks.autoOn", "Platby s variabilním symbolem odkazu se potvrdí automaticky (Fio).", "Payments with the link's variable symbol are confirmed automatically (Fio)."),
  r("settlementLinks.autoOff", "Bez Fio tokenu: lidé označí „Zaplatil(a) jsem“ a vy platbu potvrdíte tlačítkem Zaplaceno.", "Without a Fio token: people tap “I've paid this” and you confirm with Paid."),
  r("settlementLinks.allLinks", "Odkazy pro všechny", "Links for everyone"),
  r("settlementLinks.hint", "Každý má jeden odkaz na tuto akci – bez přihlášení, částky se počítají průběžně.", "Everyone has one link for this event – no login, amounts are live."),
  r("settlementLinks.copyAll", "Kopírovat vše", "Copy all"),
  r("settlementLinks.create", "Vytvořit odkaz pro vyúčtování", "Create a settlement link"),
  r("settlementLinks.link", "Vyúčtování:", "Settlement:"),
  r("settlementLinks.copy", "kopírovat odkaz", "copy the link"),
  r("settlementLinks.copied", "zkopírováno", "copied"),
  r("settlementLinks.open", "otevřít", "open"),
  r("settlementLinks.reissue", "nový odkaz", "new link"),
  r("settlementLinks.reissueHint", "Starý odkaz přestane fungovat.", "The old link stops working."),
  r("settlementLinks.reissueConfirm", "Vytvořit nový odkaz? Starý přestane fungovat a označení „zaplaceno“ se zruší.", "Create a new link? The old one stops working and “paid” marks are cleared."),
  r("settlementLinks.claimed", "Označil(a) jako zaplacené {date} – potvrďte tlačítkem Zaplaceno.", "Marked as paid on {date} – confirm with Paid."),
  r("settlementLinks.received", "Potvrdil(a) příjem peněz {date}.", "Confirmed receiving the money on {date}."),
  r("settlementLinks.claimedPair", "označeno jako zaplacené {date}", "marked as paid on {date}"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} settlement links keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
