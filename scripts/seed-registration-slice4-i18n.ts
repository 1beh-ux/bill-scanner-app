// Registration & membership, slice 4 (docs/registration-slice4-spec.md):
// feedback round 1. Portal/public keys (portal.*, public.*) are read in Czech
// only for now -- they still get an en text. Run after the slice-3 seed (it
// updates portal.uploadDone).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // 1-5. portal
    { key: "portal.everyone", cs: "Všichni", en: "Everyone" },
    { key: "portal.stateFilter", cs: "Stav přihlášek", en: "Registration status" },
    { key: "portal.state.all", cs: "Vše", en: "All" },
    { key: "portal.state.missing", cs: "Chybí údaje nebo dokumenty", en: "Details or documents missing" },
    { key: "portal.state.waiting", cs: "Čeká na potvrzení", en: "Waiting for confirmation" },
    { key: "portal.state.complete", cs: "Vše hotovo", en: "All done" },
    { key: "portal.showMore", cs: "Zobrazit více", en: "Show more" },
    { key: "portal.showLess", cs: "Zobrazit méně", en: "Show less" },
    { key: "portal.upload", cs: "Nahrát dokument", en: "Upload document" },
    { key: "portal.uploadAgain", cs: "Nahrát znovu", en: "Upload again" },
    { key: "portal.uploadHint", cs: "Místo e-mailu: PDF, JPG nebo PNG, max 15 MB. Po kontrole se dokument označí jako přijatý.", en: "Instead of e-mail: PDF, JPG or PNG, max 15 MB. Marked received once we've checked it." },
    { key: "portal.paid", cs: "Zaplaceno", en: "Paid" },
    { key: "portal.awaitingPayment", cs: "Čeká na platbu", en: "Awaiting payment" },
    { key: "portal.paymentDelayNote", cs: "Platba se zde zobrazí s několikadenním zpožděním — není třeba se znepokojovat.", en: "A payment shows up here with a delay of a few days — no need to worry." },
    { key: "paymentDoc.label", cs: "Dokument platby", en: "Payment document" },
    { key: "paymentDoc.none", cs: "— žádný —", en: "— none —" },
    { key: "paymentDoc.hint", cs: "Typ dokumentu, jehož přijetí (ručně, z tabulky…) znamená „Zaplaceno“. V portálu se nenabízí k nahrání a místo v dokumentech se ukáže u platby („Čeká na platbu“ / „Zaplaceno“).", en: "The document type whose receipt (manual tick, sheet…) means “Paid”. Not offered for upload in the portal; shown in the payment block (“Awaiting payment” / “Paid”) instead of the documents." },
    // 8. admin filter
    { key: "participantsPage.stateFilter", cs: "Stav přihlášky", en: "Registration status" },
    // 10. after a portal registration (the parent already has the link)
    { key: "portal.registeredPending", cs: "Přihlášku jsme přijali. Po potvrzení vám pošleme e-mail s dalšími informacemi.", en: "We've received the registration. Once it's confirmed we'll e-mail you further information." },
    { key: "portal.registeredAccepted", cs: "Přihláška je potvrzená.", en: "The registration is confirmed." },
    { key: "portal.registeredSent", cs: "Přihláška je potvrzená — potvrzení a dokumenty jsme vám poslali e-mailem.", en: "The registration is confirmed — we've e-mailed you the confirmation and documents." },

    // 9. field settings for parents
    { key: "portalColumn.title", cs: "Rodiče v portálu", en: "Parents in the portal" },
    { key: "portalColumn.orgHint", cs: "„Rodiče v portálu“: co rodiče u pole v portálu vidí a smí upravit (úprava ke schválení čeká na vás v Lidé) a zda je povinné ve veřejné přihlášce.", en: "“Parents in the portal”: what parents see and may edit for the field in the portal (edits with approval wait for you on People) and whether it's required in the public form." },
    { key: "portalColumn.eventHint", cs: "„Rodiče v portálu“ patří šabloně pole organizace — změna zde upraví šablonu (Šablony → Účastníci), tedy všechny akce. Pole jen pro tuto akci v portálu být nemohou.", en: "“Parents in the portal” belongs to the organisation's field template — changing it here edits the template (Templates → Participants), i.e. every event. Fields only for this event can't be in the portal." },
    { key: "portalColumn.eventOnly", cs: "jen pro tuto akci — v portálu nelze", en: "this event only — not in the portal" },
    { key: "portalAccess.hidden", cs: "skryté", en: "hidden" },
    { key: "portalAccess.read", cs: "jen vidí", en: "view only" },
    { key: "portalAccess.edit", cs: "mohou upravit", en: "may edit" },
    { key: "portalAccess.approval", cs: "úprava ke schválení", en: "edit needs approval" },
    { key: "publicSettings.requiredInRegistration", cs: "povinné při registraci", en: "required when registering" },
    { key: "people.portalFieldsLink", cs: "Co vidí a upravují rodiče →", en: "What parents see and edit →" },

    // 10. public registration confirmation (updates the slice-3 public.doneHint)
    { key: "public.doneHint", cs: "Přihlášku jsme přijali. Po potvrzení vám pošleme e-mail s dalšími informacemi a odkazem do portálu.", en: "We've received the registration. Once it's confirmed we'll e-mail you further information and a link to the portal." },
    { key: "public.doneLinkHint", cs: "Přihláška je přijatá a potvrzení vám právě posíláme e-mailem. Tady je odkaz do vašeho rodinného portálu — uložte si tento odkaz:", en: "The registration is accepted and we're e-mailing you the confirmation now. Here is the link to your family portal — save this link:" },
    { key: "public.doneLinkGate", cs: "Při otevření se portál zeptá na datum narození některého z přihlášených. Odkaz prosím nikomu dalšímu neposílejte.", en: "When opened, the portal asks for the birth date of one of the registered people. Please don't share the link." },
    { key: "public.copyLink", cs: "Kopírovat odkaz", en: "Copy link" },
    { key: "public.copied", cs: "Zkopírováno", en: "Copied" },
    // 11. template variables
    { key: "templatePreview.eventVariables", cs: "Vždy k dispozici: {{camp_name}}, {{questionnaire_url}}, {{questionnaire_line}}, {{registration_deadline}}, {{registration_deadline_line}}, {{health_notes}}, {{portal_link}}, {{portal_link_line}}", en: "Always available: {{camp_name}}, {{questionnaire_url}}, {{questionnaire_line}}, {{registration_deadline}}, {{registration_deadline_line}}, {{health_notes}}, {{portal_link}}, {{portal_link_line}}" },

    // 6-7. upload review
    { key: "portal.uploadDone", cs: "Nahráno — dokument teď zkontrolujeme.", en: "Uploaded — we'll check the document now." },
    { key: "portal.docInReview", cs: "nahráno, čeká na kontrolu", en: "uploaded, waiting for review" },
    { key: "portal.docRejected", cs: "Zamítnuto: {note} — nahrajte prosím nový.", en: "Rejected: {note} — please upload a new one." },
    { key: "uploadReview.title", cs: "Nahrané dokumenty ke kontrole ({count})", en: "Uploaded documents to review ({count})" },
    { key: "uploadReview.hint", cs: "Dokumenty, které rodiče nahráli v portálu. Do schválení se nepočítají jako přijaté (počty, stav dokumentů, e-maily, tabulka). Nic se neposílá.", en: "Documents parents uploaded in the portal. Until approved they don't count as received (counts, document status, e-mails, sheet). Nothing is e-mailed." },
    { key: "uploadReview.empty", cs: "Nic nečeká na kontrolu.", en: "Nothing is waiting for review." },
    { key: "uploadReview.listLink", cs: "Nahrané dokumenty ke kontrole ({count})", en: "Uploaded documents to review ({count})" },
    { key: "uploadReview.open", cs: "Zobrazit", en: "View" },
    { key: "uploadReview.download", cs: "Stáhnout", en: "Download" },
    { key: "uploadReview.approve", cs: "Schválit", en: "Approve" },
    { key: "uploadReview.reject", cs: "Zamítnout", en: "Reject" },
    { key: "uploadReview.reason", cs: "Důvod (uvidí ho rodiče)", en: "Reason (parents will see it)" },
    { key: "uploadReview.failed", cs: "Nepodařilo se uložit.", en: "Couldn't save." },
    { key: "uploadReview.pendingFrom", cs: "Nahráno v portálu {date} — čeká na kontrolu", en: "Uploaded in the portal {date} — waiting for review" },
    { key: "uploadReview.rejectedNote", cs: "Zamítnuto ({date}): {note}", en: "Rejected ({date}): {note}" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 4 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
