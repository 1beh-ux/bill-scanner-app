// 2026-10-23: payment check interval + "check now", portal link recovery / join, public contact, Slides tickets. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("ticketSettings.bankCheckInterval", "Jak často kontrolovat platby", "How often to check payments"),
  r("ticketSettings.everyMinutes", "každých {n} min", "every {n} min"),
  r("ticketSettings.bankCheckIntervalHint", "Fio dovolí jeden dotaz na token za 30 sekund, proto je nejkratší interval 1 minuta. Kontrola se k Fio vůbec neptá, když nic nečeká na zaplacení. Na stejném účtu se kontroluje podle nejčastěji nastavené akce.", "Fio allows one call per token per 30 seconds, so the shortest interval is 1 minute. The check doesn't call Fio at all when nothing awaits payment. One account is checked as often as its most frequent event."),
  r("tickets.checkNow", "Zkontrolovat platby teď", "Check payments now"),
  r("tickets.checking", "Kontroluji…", "Checking…"),
  r("tickets.checkDone", "Hotovo – nově zaplaceno: {n}, ke kontrole: {review}.", "Done – newly paid: {n}, to review: {review}."),
  r("tickets.checkThrottled", "Banka se kontrolovala před chvílí – Fio dovolí jeden dotaz za 30 sekund. Zkuste to za chvíli.", "The bank was checked a moment ago – Fio allows one call per 30 seconds. Try again shortly."),
  r("tickets.checkNothing", "Žádná objednávka nečeká na platbu.", "No order is waiting for payment."),
  r("tickets.checkError", "Kontrola se nepovedla ({code}).", "The check failed ({code})."),
  r("tickets.checkFailed", "Kontrola se nepovedla.", "The check failed."),
  r("ticketSettings.docTemplate", "Vstupenka z Google dokumentu nebo prezentace (nepovinné)", "Ticket from a Google Doc or Slides (optional)"),
  r("ticketSettings.docTemplateHint", "Pro logo, vlastní písmo a vzhled vložte odkaz na Google dokument nebo Google prezentaci. Proměnné jako {{event_name}}, {{buyer_name}}, {{price_type}}, {{ticket_code}} pište do textu. Dokument: {{ticket_qr}} na místo QR kódu. Prezentace (malý vlastní formát, Soubor → Vzhled stránky → Vlastní): vstupenka je první snímek; QR kód nahradí tvar (např. obdélník), ve kterém je jen text {{ticket_qr}} – velikost a místo tvaru určí velikost a místo QR. Soubor musí být dostupný účtu, přes který akce pracuje s Google Diskem. Prázdné pole = textová šablona níže.", "For a logo, your own font and design, paste a link to a Google Doc or Google Slides. Write variables like {{event_name}}, {{buyer_name}}, {{price_type}}, {{ticket_code}} into the text. Doc: {{ticket_qr}} where the QR goes. Slides (a small custom size, File → Page setup → Custom): the ticket is the first slide; the QR replaces a shape (e.g. a rectangle) holding only the text {{ticket_qr}} – the shape's size and place set the QR's. The file must be reachable by the account the event uses for Google Drive. Empty = the text template below."),
  r("portalSettings2.title", "Rodičovský portál a kontakt", "Parent portal and contact"),
  r("portalSettings2.failed", "Uložení se nepovedlo – zkontrolujte e-mail a adresu.", "Saving failed – check the e-mail and the address."),
  r("portalSettings2.contact", "Kontaktní e-mail na veřejných stránkách", "Contact e-mail on the public pages"),
  r("portalSettings2.contactHint", "Ukazuje se dole v rodičovském portálu a na přihláškách. Akce si může nastavit vlastní (Nastavení akce → Veřejná přihláška).", "Shown at the bottom of the parent portal and the registration pages. An event can set its own (Event settings → Public registration)."),
  r("portalSettings2.recoverySender", "„Zapomněl(a) jsem odkaz do portálu“ – odesílat z", "“I forgot my portal link” – send from"),
  r("portalSettings2.recoveryOff", "Vypnuto (tlačítko se neukáže)", "Off (no button)"),
  r("portalSettings2.recoveryHint", "Rodič zadá e-mail a datum narození kohokoli z portálu. Když e-mail patří k zákonnému zástupci (s posíláním e-mailů) a datum k člověku z toho odkazu, pošle se odkaz na ten e-mail. Odpověď nikdy neprozradí, jestli se něco našlo. Odesílá se ze zvolené připojené schránky šablonou „Odkaz do portálu“.", "A parent types an e-mail and the birth date of anyone in the portal. When the e-mail belongs to a guardian (receiving e-mails) and the date to a person of that link, the link goes to that e-mail. The answer never tells whether anything matched. Sent from the chosen connected mailbox with the “Portal link” template."),
  r("portalSettings2.recoverySame", "Poslat stejný odkaz (dosavadní dál funguje)", "Send the same link (the current one keeps working)"),
  r("portalSettings2.recoveryNew", "Vytvořit nový odkaz – dosavadní přestane fungovat (když si lidé odkazy přeposílají)", "Make a new link – the current one stops working (when people pass links on)"),
  r("portalSettings2.joinEvent", "„Ještě nejsem členem organizace – registrovat“ vede na přihlášku akce", "“Not a member yet – register” leads to an event's registration"),
  r("portalSettings2.joinNone", "— žádná —", "— none —"),
  r("portalSettings2.joinUrl", "…nebo na vlastní adresu", "…or to your own address"),
  r("portalSettings2.joinHint", "Vlastní adresa má přednost. Bez obou se tlačítko neukáže.", "Your own address wins. Without either, there's no button."),
  r("portal.recoverButton", "Zapomněl(a) jsem odkaz do svého portálu", "I forgot the link to my portal"),
  r("portal.recoverNote", "Máte odkaz, který vám někdo přeposlal, nebo jste svůj ztratili? Pošleme vám ten váš na e-mail.", "Got a link someone forwarded you, or lost yours? We'll e-mail you your own."),
  r("portal.recoverHint", "Zadejte e-mail, na který vám od nás chodí zprávy, a datum narození kohokoli z vaší rodiny v portálu. Když údaje sedí, pošleme odkaz na tento e-mail.", "Enter the e-mail you get our messages at and the birth date of anyone of your family in the portal. If they match, we'll send the link to this e-mail."),
  r("portal.recoverEmail", "Váš e-mail", "Your e-mail"),
  r("portal.recoverBirthDate", "Datum narození někoho z rodiny", "Birth date of someone in the family"),
  r("portal.recoverSubmit", "Poslat odkaz", "Send the link"),
  r("portal.recover.sent", "Pokud údaje sedí, odkaz je na cestě do vaší schránky (podívejte se i do spamu).", "If the details match, the link is on its way to your inbox (check spam too)."),
  r("portal.recover.throttled", "Příliš mnoho pokusů. Zkuste to prosím později.", "Too many attempts. Please try again later."),
  r("portal.recover.failed", "Nepovedlo se odeslat. Zkuste to prosím znovu.", "Couldn't send. Please try again."),
  r("portal.joinButton", "Ještě nejsem členem organizace – registrovat", "Not a member yet – register"),
  r("publicSettings.contact", "Kontaktní e-mail této akce (nepovinné)", "This event's contact e-mail (optional)"),
  r("publicSettings.contactHint", "Ukáže se dole na stránce přihlášky / vstupenek místo kontaktu organizace.", "Shown at the bottom of the registration / ticket page instead of the organization's contact."),
  r("publicSettings.contactInvalid", "Kontaktní e-mail nevypadá správně.", "The contact e-mail doesn't look right."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} payments/portal keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
