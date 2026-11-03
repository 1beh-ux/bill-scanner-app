// 2026-11-03: Platby summary lines, cancelling a payment, paid items apart on the link, replacing a file. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("paymentsPage.officialBills", "Oficiální účtenky", "Official bills"),
  r("paymentsPage.netPayOut", "Po započtení proplatit", "After netting, pay out"),
  r("paymentsPage.netTheyPay", "Po započtení zaplatí akci", "After netting, they pay the event"),
  r("personalBills.qrPayout", "QR k proplacení ({name})", "QR to pay out ({name})"),
  r("personalBills.replaceFile", "Nahradit soubor", "Replace the file"),
  r("personalBills.cancelPayment", "zrušit platbu", "cancel the payment"),
  r("personalBills.cancelPaymentTitle", "Zrušit platbu: {name}, {amount}", "Cancel the payment: {name}, {amount}"),
  r("personalBills.cancelPaymentNote", "Důvod (povinné) – např. testovací platba", "Reason (required) – e.g. a test payment"),
  r("personalBills.cancelPaymentHint", "Zaplacená část bude znovu k zaplacení (pak ji jde snížit nebo smazat). Zrušení i s důvodem zůstane v Historii plateb.", "The paid part is open again (then it can be lowered or removed). The cancellation and its reason stay in the Payment history."),
  r("personalBills.cancelPaymentConfirm", "Opravdu zrušit platbu {amount} od {name}? Zůstane jen záznam v Historii plateb.", "Really cancel the payment of {amount} from {name}? Only a record stays in the Payment history."),
  r("personalBills.error.note_required", "Napište důvod zrušení.", "Write the reason for cancelling."),
  r("personalBills.error.nothing_paid", "Tady není nic zaplaceného.", "Nothing is paid here."),
  r("personalBills.error.bad_type", "Jen PDF nebo fotka (JPG, PNG, WEBP, HEIC).", "Only a PDF or a photo (JPG, PNG, WEBP, HEIC)."),
  r("personalBills.error.no_file", "Vyberte soubor (do 15 MB).", "Choose a file (up to 15 MB)."),
  r("settlementLinks.history.voided", "platba zrušena (zaplaceno {date})", "payment cancelled (paid on {date})"),
  r("settlementLinks.history.reason", "Důvod: {note}", "Reason: {note}"),
  r("settlementPage.paidTitle", "Již zaplaceno a vyrovnáno", "Already paid and settled"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} payments batch keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
