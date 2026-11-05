// 2026-10-23: two-step registration (details after acceptance) and the participant's own page. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("publicSettings.detailsLater", "Podrobné údaje až po přijetí", "Detailed information after acceptance"),
  r("publicSettings.detailsLaterHint", "Při přihlášce (veřejné i v portálu) se ptáme jen na základní údaje. Podrobné údaje (např. zdravotní) a vlastní otázky akce rodiče doplní až po přijetí – v portálu u přihlášky, nebo na osobním odkazu, když účastník není propojený s Lidmi. Do e-mailu o přijetí dejte {{details_link_line}} (nebo {{details_link}}).", "Registering (public and in the portal) asks only the basic details. The detailed ones (e.g. health) and the event's own questions are filled in after acceptance – in the portal on the registration, or on a personal link when the participant isn't linked to People. Put {{details_link_line}} (or {{details_link}}) into the acceptance e-mail."),
  r("public.detailsLaterNote", "Podrobné údaje vyplníte až po přijetí přihlášky – pošleme vám odkaz e-mailem.", "You'll fill in the detailed information after the registration is accepted – we'll e-mail you a link."),
  r("portal.laterTitle", "Doplňte prosím údaje k přihlášce", "Please complete the registration details"),
  r("portal.laterHint", "Přihláška je přijatá. Než akce začne, doplňte prosím tyto údaje. Údaje z profilu se uloží i do profilu.", "The registration is accepted. Before the event, please fill in these details. Profile details are saved to the profile too."),
  r("portal.laterDone", "Údaje k přihlášce jsou doplněné (upravit)", "Registration details are complete (edit)"),
  r("portal.laterInvalid", "Vyplňte prosím všechna pole.", "Please fill in every field."),
  r("participantPage.gateTitle", "Údaje k přihlášce", "Registration details"),
  r("participantPage.gateHint", "Pro otevření zadejte datum narození přihlášeného.", "To open, enter the registered person's birth date."),
  r("participantPage.detailsTitle", "Údaje", "Details"),
  r("participantPage.paymentTitle", "Platba", "Payment"),
  r("participantPage.amount", "Částka: {amount} Kč", "Amount: {amount} CZK"),
  r("participantPage.account", "Číslo účtu: {account}", "Account: {account}"),
  r("participantPage.vs", "Variabilní symbol: {vs}", "Variable symbol: {vs}"),
  r("participantPage.documentsTitle", "Dokumenty", "Documents"),
  r("participantPage.received", "přijato", "received"),
  r("participantPage.pending", "čeká na kontrolu", "awaiting review"),
  r("participantPage.upload", "Nahrát", "Upload"),
  r("participantPage.missing", "chybí", "missing"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} two-step keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
