// 2026-11-03: Vyúčtování -- texts sent with the links, "Souhlasím s vyúčtováním", payment history. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("settlementLinks.texts", "Texty zpráv k odkazům", "Messages sent with the links"),
  r("settlementLinks.textsHint", "Proměnné: {jmeno} (křestní jméno), {akce}, {castka} (k zaplacení, jinak k vrácení), {zaplatit}, {dostanes}, {odkaz}. Když text {odkaz} nemá, odkaz se přidá na konec.", "Variables: {jmeno} (first name), {akce}, {castka} (to pay, else to get), {zaplatit}, {dostanes}, {odkaz}. Without {odkaz} the link is added at the end."),
  r("settlementLinks.text.owes", "Jen platí (dluží akci nebo někomu)", "Only pays (owes the event or someone)"),
  r("settlementLinks.text.owed", "Jen dostane (akce mu dluží)", "Only gets (the event owes them)"),
  r("settlementLinks.text.both", "Obojí (platil(a) za něco a zároveň má útraty)", "Both (paid for something and has spending too)"),
  r("settlementLinks.copyWithText", "kopírovat s textem", "copy with the text"),
  r("settlementLinks.accepted", "Souhlasil(a) s vyúčtováním {amount} ({date}).", "Accepted the settlement of {amount} ({date})."),
  r("settlementLinks.acceptedChanged", "Souhlasil(a) s {amount} – částka se od té doby změnila.", "Accepted {amount} – the amount has changed since."),
  r("settlementLinks.history.title", "Historie plateb", "Payment history"),
  r("settlementLinks.history.hint", "Co už je proplacené, zaplacené a vyrovnané – kdy a kdo to potvrdil (uživatel, nebo banka / odkaz).", "What is already paid out, paid and settled – when and who confirmed it (a user, or the bank / the link)."),
  r("settlementLinks.history.byPerson", "podle lidí", "by person"),
  r("settlementLinks.history.byDate", "podle data", "by date"),
  r("settlementLinks.history.empty", "Zatím nic zaplaceného.", "Nothing paid yet."),
  r("settlementLinks.history.totals", "proplaceno {out} · přijato {in}", "paid out {out} · received {in}"),
  r("settlementLinks.history.payout", "proplaceno", "paid out"),
  r("settlementLinks.history.paid", "zaplatil(a) akci", "paid the event"),
  r("settlementLinks.history.paidBack", "vráceno za {name}", "paid back for {name}"),
  r("settlementLinks.history.direct", "zaplatil(a) napřímo {name}", "paid {name} directly"),
  r("settlementLinks.history.auto", "banka / odkaz", "bank / link"),
  r("settlementPage.accept", "Souhlasím s vyúčtováním ({amount})", "I agree with the settlement ({amount})"),
  r("settlementPage.acceptHint", "Potvrďte, že účtenky i částka sedí – pokladník vám pak peníze pošle.", "Confirm the bills and the amount are right – the treasurer then sends you the money."),
  r("settlementPage.accepted", "Souhlasíte s vyúčtováním ({date})", "You agreed with the settlement ({date})"),
  r("settlementPage.acceptedChanged", "Souhlasili jste s {amount}, částka se ale změnila – potvrďte prosím znovu.", "You agreed to {amount}, but the amount has changed – please confirm again."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} settlement links 4 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
