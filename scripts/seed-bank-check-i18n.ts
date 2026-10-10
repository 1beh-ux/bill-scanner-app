// Bank payment check (docs/bank-payments-design.md): Organizace -> Připojení -> Banka,
// event settings switch, Zkontrolovat platby, Platby z banky, portal payment card.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // Organizace -> Připojení -> Banka
    { key: "bankAccounts.title", cs: "Banka", en: "Bank" },
    { key: "bankAccounts.subtitle", cs: "Účty Fio banky, ze kterých aplikace automaticky ověřuje platby účastníků.", en: "Fio bank accounts the app checks participants' payments on." },
    { key: "bankAccounts.connect", cs: "Připojit Fio účet", en: "Connect a Fio account" },
    { key: "bankAccounts.connectButton", cs: "Připojit", en: "Connect" },
    { key: "bankAccounts.label", cs: "Název", en: "Name" },
    { key: "bankAccounts.accountNumber", cs: "Číslo účtu", en: "Account number" },
    { key: "bankAccounts.token", cs: "Token", en: "Token" },
    { key: "bankAccounts.tokenHelp", cs: "Token vytvořte v Fio internetovém bankovnictví: Nastavení -> API -> Přidat token, typ „Pouze sledovat účet“ (nemůže odesílat peníze). Platí 180 dní, použitelný asi 5 minut po vytvoření. Token sem vložíte jen jednou; aplikace ho už nikdy nezobrazí.", en: "Create the token in Fio internet banking: Settings -> API -> Add token, type “Account monitoring only” (cannot send money). Valid for 180 days, usable about 5 minutes after it's created. You enter it here once; the app never shows it again." },
    { key: "bankAccounts.tokenOk", cs: "Token uložen, spojení s bankou funguje.", en: "Token saved, the bank connection works." },
    { key: "bankAccounts.empty", cs: "Zatím není připojený žádný účet.", en: "No account connected yet." },
    { key: "bankAccounts.noToken", cs: "Bez tokenu – kontrola neběží.", en: "No token – not checking." },
    { key: "bankAccounts.problem", cs: "Problém: {problem}", en: "Problem: {problem}" },
    { key: "bankAccounts.lastOk", cs: "Naposledy OK: {when}", en: "Last OK: {when}" },
    { key: "bankAccounts.neverChecked", cs: "Zatím nekontrolováno.", en: "Not checked yet." },
    { key: "bankAccounts.tokenExpires", cs: "Token platí do {date}.", en: "Token valid until {date}." },
    { key: "bankAccounts.tokenExpiresSoon", cs: "Token brzy vyprší ({date}) – vytvořte nový a vyměňte ho.", en: "Token expires soon ({date}) – create a new one and replace it." },
    { key: "bankAccounts.tokenExpired", cs: "Token vypršel {date} – vytvořte nový a vyměňte ho.", en: "Token expired on {date} – create a new one and replace it." },
    { key: "bankAccounts.usedBy", cs: "Ověřuje platby pro: {events}", en: "Checks payments for: {events}" },
    { key: "bankAccounts.setToken", cs: "Vložit token", en: "Enter token" },
    { key: "bankAccounts.replaceToken", cs: "Vyměnit token", en: "Replace token" },
    { key: "bankAccounts.checkNow", cs: "Zkontrolovat nyní", en: "Check now" },
    { key: "bankAccounts.nothingToDo", cs: "Žádná akce s tímto účtem nečeká na platbu.", en: "No event using this account is waiting for a payment." },
    { key: "bankAccounts.disconnect", cs: "Odpojit", en: "Disconnect" },
    { key: "bankAccounts.disconnectConfirm", cs: "Odpojit účet „{label}“? Token se smaže a automatické ověřování plateb se vypne u všech akcí, které ho používají. Potvrzené platby zůstanou.", en: "Disconnect “{label}”? The token is deleted and the automatic payment check is switched off for every event using it. Confirmed payments stay." },
    { key: "bankAccounts.deleteMovements", cs: "Smazat i uložené platby", en: "Also delete the stored payments" },
    { key: "bankAccounts.error.invalid", cs: "Vyplňte název a platné číslo účtu (např. 2900123456).", en: "Fill in a name and a valid account number (e.g. 2900123456)." },
    { key: "bankAccounts.error.exists", cs: "Tento účet už je připojený.", en: "This account is already connected." },
    { key: "bankAccounts.error.admin_only", cs: "Účty může připojit jen správce organizace.", en: "Only an organization admin can connect accounts." },
    { key: "bankAccounts.error.failed", cs: "Uložení se nepovedlo.", en: "Saving failed." },
    // Short error codes (src/lib/bank/fio-client.ts) -> readable text
    { key: "bankCheck.error.throttled", cs: "banka chvíli nepřijímá dotazy, zkuste to za 30 s", en: "the bank is not taking requests for a moment, try again in 30 s" },
    { key: "bankCheck.error.token_invalid", cs: "token je neplatný nebo vypršel – vyměňte ho", en: "the token is invalid or expired – replace it" },
    { key: "bankCheck.error.unreachable", cs: "banka je nedostupná", en: "the bank is unreachable" },
    { key: "bankCheck.error.bad_response", cs: "banka vrátila nečekanou odpověď", en: "the bank sent an unexpected response" },
    { key: "bankCheck.error.no_token", cs: "účet nemá token", en: "the account has no token" },
    { key: "bankCheck.error.invalid_format", cs: "token má mít 64 znaků (písmena a číslice)", en: "the token must be 64 characters (letters and digits)" },
    // Event settings
    { key: "bankCheck.eventSwitch", cs: "Automaticky ověřovat platby z banky", en: "Check payments from the bank automatically" },
    { key: "bankCheck.pickAccount", cs: "— vyberte účet —", en: "— pick an account —" },
    { key: "bankCheck.noMatchingAccount", cs: "Účet pro platby akce není připojený Fio účet – připojte ho v Organizace -> Připojení -> Banka", en: "The event's payment account isn't a connected Fio account – connect it in Organization -> Connections -> Bank" },
    { key: "bankCheck.bank_check_no_payment_doc", cs: "Automatické ověřování plateb potřebuje vybraný Dokument platby.", en: "The automatic payment check needs a payment document." },
    { key: "bankCheck.bank_check_account", cs: "Vybraný účet nepatří organizaci nebo se neshoduje s účtem pro platby akce (číslo účtu a kód banky).", en: "The chosen account isn't the organization's or doesn't match the event's payment account (number and bank code)." },
    // Roster / Pošta -> Dokumenty
    { key: "bankCheck.button", cs: "Zkontrolovat platby", en: "Check payments" },
    { key: "bankCheck.result.settled", cs: "Potvrzeno {count} plateb.", en: "Confirmed {count} payments." },
    { key: "bankCheck.result.nothingNew", cs: "Nic nového.", en: "Nothing new." },
    { key: "bankCheck.result.throttled", cs: "Kontrola proběhla před chvílí, zkuste za 30 s.", en: "Checked a moment ago, try again in 30 s." },
    { key: "bankCheck.result.error", cs: "Problém: {problem}", en: "Problem: {problem}" },
    { key: "bankCheck.cellReceived", cs: "Doručeno · banka", en: "Received · bank" },
    { key: "bankCheck.cellHint", cs: "Platba z banky {date}, {amount}. Kliknutím zrušíte (platba se už automaticky nepoužije).", en: "Bank payment {date}, {amount}. Click to undo (the payment won't be used automatically again)." },
    { key: "participantDetail.documentsVia.bank", cs: "z banky", en: "from the bank" },
    // Platby z banky
    { key: "bankPayments.title", cs: "Platby z banky", en: "Bank payments" },
    { key: "bankPayments.hint", cs: "Příchozí platby, které se nepodařilo spárovat automaticky, a už rozhodnuté platby.", en: "Incoming payments that couldn't be matched automatically, and the decided ones." },
    { key: "bankPayments.tab.review", cs: "K vyřešení", en: "To resolve" },
    { key: "bankPayments.tab.done", cs: "Spárované", en: "Matched" },
    { key: "bankPayments.empty.review", cs: "Nic k vyřešení.", en: "Nothing to resolve." },
    { key: "bankPayments.empty.done", cs: "Zatím žádné spárované platby.", en: "No matched payments yet." },
    { key: "bankPayments.reason.underpaid", cs: "Zaplaceno méně", en: "Underpaid" },
    { key: "bankPayments.reason.overpaid", cs: "Zaplaceno víc než dvojnásobek", en: "Paid more than double" },
    { key: "bankPayments.reason.no_match", cs: "Neznámý variabilní symbol", en: "Unknown variable symbol" },
    { key: "bankPayments.reason.ambiguous", cs: "Symbol odpovídá více účastníkům", en: "The symbol matches several participants" },
    { key: "bankPayments.reason.duplicate", cs: "Už zaplaceno", en: "Already paid" },
    { key: "bankPayments.reason.not_czk", cs: "Jiná měna než Kč", en: "Not in CZK" },
    { key: "bankPayments.settledTo", cs: "Spárováno: {name}", en: "Matched: {name}" },
    { key: "bankPayments.ignored", cs: "Ignorováno", en: "Ignored" },
    { key: "bankPayments.decidedBy", cs: "rozhodl(a) {name}", en: "decided by {name}" },
    { key: "bankPayments.assignToParticipant", cs: "Přiřadit účastníkovi", en: "Assign to a participant" },
    { key: "bankPayments.pickParticipant", cs: "— vyberte účastníka —", en: "— pick a participant —" },
    { key: "bankPayments.assign", cs: "Přiřadit", en: "Assign" },
    { key: "bankPayments.ignore", cs: "Ignorovat", en: "Ignore" },
    { key: "bankPayments.error.already_paid", cs: "Účastník už má platbu potvrzenou.", en: "The participant's payment is already confirmed." },
    { key: "bankPayments.error.already_settled", cs: "Platba už je spárovaná.", en: "The payment is already matched." },
    { key: "bankPayments.error.no_payment_doc", cs: "Akce nemá vybraný Dokument platby.", en: "The event has no payment document." },
    { key: "bankPayments.error.not_in_review", cs: "Platba už je vyřešená.", en: "The payment is already resolved." },
    { key: "bankPayments.error.not_found", cs: "Nenalezeno.", en: "Not found." },
    { key: "bankPayments.error.failed", cs: "Nepovedlo se.", en: "That didn't work." },
    // Portal payment card
    { key: "portal.bankCheckButton", cs: "Zkontrolovat platbu", en: "Check payment" },
    { key: "portal.bankCheckNote", cs: "Platbu ověřujeme automaticky z banky, obvykle do minuty od připsání na účet.", en: "We check the payment with the bank automatically, usually within a minute of it arriving." },
    { key: "portal.bankNotYet", cs: "Platbu zatím nevidíme.", en: "We don't see the payment yet." },
    { key: "portal.bankPaid", cs: "Platba přijata ✓ (potvrzeno z banky, {date})", en: "Payment received ✓ (confirmed by the bank, {date})" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} bank check keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
