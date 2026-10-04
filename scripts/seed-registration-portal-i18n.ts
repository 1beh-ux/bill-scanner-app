// Registration & membership, slice 2 (docs/registration-portal-spec.md): child
// profiles, pending changes, portal link e-mails, eligibility, the parent portal.
// The portal is Czech only for now -- its keys (portal.*) still get an en text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // A. membership shown from the membership event
    { key: "membershipField.yes", cs: "Ano", en: "Yes" },
    { key: "membershipField.confirmedHint", cs: "potvrzené členství {year}", en: "confirmed membership {year}" },

    // B/D/F. child profile, pending changes, portal link (Děti page + child detail)
    { key: "childProfile.fillButton", cs: "Doplnit profily z poslední akce", en: "Fill profiles from the latest event" },
    { key: "childProfile.fillHint", cs: "Dětem s prázdným profilem zkopíruje údaje a zákonné zástupce z jejich poslední akce.", en: "Children with an empty profile get the fields and guardians of their latest event." },
    { key: "childProfile.fillDone", cs: "Doplněno profilů: {count}.", en: "Profiles filled: {count}." },
    { key: "childProfile.pendingTitle", cs: "Ke schválení ({count})", en: "To approve ({count})" },
    { key: "childProfile.pendingHint", cs: "Změny od rodičů z portálu. Dokud je neschválíte, platí všude původní hodnota.", en: "Changes parents made in the portal. Until approved, the old value stays in use everywhere." },
    { key: "childProfile.accept", cs: "Schválit", en: "Accept" },
    { key: "childProfile.reject", cs: "Zamítnout", en: "Reject" },
    { key: "childProfile.colPortal", cs: "Portál rodičů", en: "Parent portal" },
    { key: "childProfile.copyLink", cs: "Kopírovat odkaz", en: "Copy link" },
    { key: "childProfile.linkCopied", cs: "Odkaz do portálu ({name}) je ve schránce.", en: "Portal link ({name}) copied." },
    { key: "childProfile.selectAll", cs: "Vybrat vše", en: "Select all" },
    { key: "childProfile.sendLinkSelected", cs: "Poslat odkaz do portálu ({count})", en: "Send portal link ({count})" },
    { key: "childProfile.notFound", cs: "Dítě nenalezeno.", en: "Child not found." },
    { key: "childProfile.portalTitle", cs: "Portál rodičů", en: "Parent portal" },
    { key: "childProfile.portalHasLink", cs: "Odkaz existuje. Nový odkaz ten starý okamžitě zneplatní (i na zařízeních, kde už byl otevřen).", en: "A link exists. A new link kills the old one at once (also on devices where it was opened)." },
    { key: "childProfile.portalNoLink", cs: "Zatím bez odkazu — vytvoří se při prvním kopírování nebo odeslání.", en: "No link yet — created on first copy or send." },
    { key: "childProfile.newLink", cs: "Nový odkaz", en: "New link" },
    { key: "childProfile.newLinkConfirm", cs: "Vytvořit nový odkaz? Starý přestane okamžitě fungovat a rodiče budou potřebovat nový.", en: "Create a new link? The old one stops working at once and the parents will need the new one." },
    { key: "childProfile.newLinkDone", cs: "Nový odkaz vytvořen — starý už nefunguje.", en: "New link created — the old one no longer works." },
    { key: "childProfile.sendLink", cs: "Poslat odkaz e-mailem", en: "Send link by e-mail" },
    { key: "childProfile.sendLinkShort", cs: "Poslat", en: "Send" },
    { key: "childProfile.profileTitle", cs: "Profil", en: "Profile" },
    { key: "childProfile.profileHint", cs: "Všechna pole organizace. Uložené změny se propíšou do nadcházejících akcí připojených k registraci (jen pole, která akce má).", en: "All organisation fields. Saved changes go to upcoming registration-connected events (only fields the event has)." },
    { key: "childProfile.saved", cs: "Uloženo.", en: "Saved." },
    { key: "childProfile.saveGuardians", cs: "Uložit zástupce", en: "Save guardians" },
    { key: "childProfile.guardiansInvalid", cs: "Každý zástupce potřebuje platný e-mail.", en: "Every guardian needs a valid e-mail." },
    { key: "childProfile.guardiansHint", cs: "Do akcí se zástupci propisují podle e-mailu: existující se upraví, noví přidají, nikdo se nemaže.", en: "Guardians reach events by e-mail: existing ones are updated, new ones added, none deleted." },
    { key: "childProfile.syncedEvent", cs: "propisuje se", en: "synced" },
    { key: "childProfile.portalNote", cs: "Poznámka z portálu", en: "Portal note" },
    { key: "childProfile.sentLinksTitle", cs: "Odeslané odkazy", en: "Sent links" },
    { key: "childProfile.sent", cs: "odesláno", en: "sent" },
    { key: "childProfile.failed", cs: "chyba", en: "failed" },

    // F. sending the portal link (compose page, template)
    { key: "childProfile.portalLinkTemplate", cs: "Odkaz do portálu rodičů", en: "Parent portal link" },
    { key: "portalCompose.title", cs: "Poslat odkaz do portálu rodičů", en: "Send the parent portal link" },
    { key: "portalCompose.from", cs: "Odesílá se z vaší připojené schránky {email}.", en: "Sent from your connected mailbox {email}." },
    { key: "portalCompose.noSender", cs: "Nemáte připojenou odesílací schránku. Připojte ji v nastavení akce (Připojení → odesílací e-mail) svým účtem a zkuste to znovu.", en: "You have no connected sending mailbox. Connect one with your own account in an event's settings (Connections → sender e-mail) and try again." },
    { key: "portalCompose.linkCreatedOnSend", cs: "(odkaz se vytvoří při odeslání)", en: "(the link is created on send)" },
    { key: "portalCompose.sendButton", cs: "Odeslat ({count})", en: "Send ({count})" },
    { key: "portalCompose.send", cs: "Odeslat", en: "Send" },
    { key: "portalCompose.confirmSend", cs: "Opravdu odeslat odkaz do portálu rodičům {count} dětí? Dětem bez odkazu se odkaz vytvoří.", en: "Really send the portal link to the parents of {count} children? Children without a link get one created." },
    { key: "portalCompose.done", cs: "Odesláno: {sent}, chyby: {failed}, bez příjemce: {none}.", en: "Sent: {sent}, failed: {failed}, no recipient: {none}." },

    // H. opening an event in the portal + eligibility (event settings -> Registrace a členství)
    { key: "portalSettings.title", cs: "Portál rodičů", en: "Parent portal" },
    { key: "portalSettings.open", cs: "Otevřeno pro přihlášky v portálu", en: "Open for registration in the portal" },
    { key: "portalSettings.openHint", cs: "Rodiče vybraných dětí uvidí akci v portálu a mohou dítě přihlásit (vznikne nepřijatý účastník, přijímáte jako dosud). Po termínu přihlášek se akce v portálu skryje.", en: "Parents of the chosen children see the event in the portal and can register (a not-yet-accepted participant; you accept as before). Hidden after the registration deadline." },
    { key: "portalSettings.pastDeadline", cs: "Termín přihlášek už uplynul — v portálu se akce nezobrazuje.", en: "The registration deadline has passed — the event isn't shown in the portal." },
    { key: "portalSettings.whoTitle", cs: "Kdo se může přihlásit", en: "Who can register" },
    { key: "portalSettings.everyone", cs: "Všechny děti", en: "All children" },
    { key: "portalSettings.criteriaHint", cs: "Musí platit všechna vyplněná kritéria. Nic nevyplněno = nikdo (kromě dětí vybraných níže).", en: "All filled-in criteria must match. Nothing filled in = nobody (except the children picked below)." },
    { key: "portalSettings.birthYearFrom", cs: "Rok narození od", en: "Birth year from" },
    { key: "portalSettings.birthYearTo", cs: "Rok narození do", en: "Birth year to" },
    { key: "portalSettings.groups", cs: "Skupina (podle poslední akce)", en: "Group (from the latest event)" },
    { key: "portalSettings.attended", cs: "Byl(a) přijat(a) na některou z akcí", en: "Was accepted to one of the events" },
    { key: "portalSettings.children", cs: "Navíc tyto děti (vždy)", en: "Plus these children (always)" },
    { key: "portalSettings.add", cs: "Přidat", en: "Add" },
    { key: "portalSettings.eligibleCount", cs: "Může se přihlásit: {count} dětí", en: "Can register: {count} children" },
    { key: "portalSettings.saved", cs: "Uloženo.", en: "Saved." },

    // G. the parent portal (/p/<token>, Czech only -- read as cs by src/app/p/[token]/page.tsx)
    { key: "portal.title", cs: "Portál rodičů", en: "Parent portal" },
    { key: "portal.loading", cs: "Načítám…", en: "Loading…" },
    { key: "portal.unavailable", cs: "Portál teď není dostupný. Zkuste to prosím později, případně se ozvěte pořadatelům.", en: "The portal isn't available right now. Please try later or contact the organisers." },
    { key: "portal.membership", cs: "Členství {year}", en: "Membership {year}" },
    { key: "portal.tab.profile", cs: "Údaje", en: "Details" },
    { key: "portal.tab.events", cs: "Přihlášky na akce", en: "Sign up" },
    { key: "portal.tab.registrations", cs: "Moje přihlášky", en: "My registrations" },
    { key: "portal.tab.history", cs: "Historie", en: "History" },
    { key: "portal.historyEmpty", cs: "Zatím žádné proběhlé akce.", en: "No past events yet." },
    { key: "portal.gateTitle", cs: "Ověření", en: "Verification" },
    { key: "portal.gateHint", cs: "Pro otevření portálu zadejte datum narození dítěte. Na tomto zařízení se na něj pak už ptát nebudeme.", en: "Enter the child's birth date to open the portal. This device won't ask again." },
    { key: "portal.gateLabel", cs: "Datum narození dítěte", en: "Child's birth date" },
    { key: "portal.gateSubmit", cs: "Pokračovat", en: "Continue" },
    { key: "portal.gateWrong", cs: "Datum narození nesouhlasí.", en: "The birth date doesn't match." },
    { key: "portal.gateThrottled", cs: "Příliš mnoho pokusů. Zkuste to prosím za hodinu.", en: "Too many attempts. Please try again in an hour." },
    { key: "portal.profileHint", cs: "Údaje, které o dítěti vedeme. Změny polí označených „se schválením“ se projeví až po schválení pořadatelem.", en: "The details we keep about the child. Changes to fields marked “with approval” apply once the organisers approve them." },
    { key: "portal.needsApproval", cs: "se schválením", en: "with approval" },
    { key: "portal.pendingApproval", cs: "Čeká na schválení: {value} (platí zatím: {old})", en: "Awaiting approval: {value} (still in use: {old})" },
    { key: "portal.save", cs: "Uložit", en: "Save" },
    { key: "portal.saved", cs: "Uloženo.", en: "Saved." },
    { key: "portal.saveFailed", cs: "Uložení se nepodařilo. Zkontrolujte údaje (každý zástupce potřebuje e-mail).", en: "Saving failed. Check the details (every guardian needs an e-mail)." },
    { key: "portal.yes", cs: "Ano", en: "Yes" },
    { key: "portal.no", cs: "Ne", en: "No" },
    { key: "portal.guardians", cs: "Zákonní zástupci", en: "Guardians" },
    { key: "portal.guardianName", cs: "Jméno", en: "Name" },
    { key: "portal.guardianEmail", cs: "E-mail", en: "E-mail" },
    { key: "portal.guardianRelationship", cs: "Vztah k dítěti", en: "Relationship" },
    { key: "portal.guardianPhone", cs: "Telefon", en: "Phone" },
    { key: "portal.guardianReceives", cs: "Dostává e-maily", en: "Receives e-mails" },
    { key: "portal.remove", cs: "Odebrat", en: "Remove" },
    { key: "portal.addGuardian", cs: "Přidat zástupce", en: "Add guardian" },
    { key: "portal.saveGuardians", cs: "Uložit zástupce", en: "Save guardians" },
    { key: "portal.noEvents", cs: "Teď není otevřená žádná akce, na kterou by šlo dítě přihlásit.", en: "No event is open for this child right now." },
    { key: "portal.deadline", cs: "Přihlášky do {date}", en: "Registration until {date}" },
    { key: "portal.register", cs: "Přihlásit", en: "Register" },
    { key: "portal.reviewHint", cs: "Přihláška se vyplní z údajů v portálu. Pokud něco nesedí, opravte to nejdřív v záložce Údaje.", en: "The registration is filled from the portal details. If something's wrong, fix it in Details first." },
    { key: "portal.reviewName", cs: "Jméno", en: "Name" },
    { key: "portal.reviewBirth", cs: "Datum narození", en: "Birth date" },
    { key: "portal.note", cs: "Poznámka pro pořadatele (nepovinné)", en: "Note for the organisers (optional)" },
    { key: "portal.registerConfirm", cs: "Odeslat přihlášku", en: "Send registration" },
    { key: "portal.cancel", cs: "Zrušit", en: "Cancel" },
    { key: "portal.registerFailed", cs: "Přihlášku se nepodařilo odeslat (akce už nemusí být otevřená).", en: "The registration couldn't be sent (the event may no longer be open)." },
    { key: "portal.noRegistrations", cs: "Žádné aktuální přihlášky.", en: "No current registrations." },
    { key: "portal.statusPending", cs: "Čeká", en: "Pending" },
    { key: "portal.statusAccepted", cs: "Přijato", en: "Accepted" },
    { key: "portal.payment", cs: "Platba", en: "Payment" },
    { key: "portal.price", cs: "Cena: {price} Kč", en: "Price: {price} CZK" },
    { key: "portal.account", cs: "Účet: {account}", en: "Account: {account}" },
    { key: "portal.vs", cs: "Variabilní symbol: {vs}", en: "Variable symbol: {vs}" },
    { key: "portal.qrAlt", cs: "QR platba", en: "Payment QR code" },
    { key: "portal.documents", cs: "Dokumenty", en: "Documents" },
    { key: "portal.docSent", cs: "posláno vám", en: "sent to you" },
    { key: "portal.docReceived", cs: "přijato od vás", en: "received from you" },

    // C. per-field portal rule (Šablony -> Účastníci)
    { key: "portalAccess.label", cs: "Portál:", en: "Portal:" },
    { key: "portalAccess.hidden", cs: "skryto", en: "hidden" },
    { key: "portalAccess.read", cs: "jen ke čtení", en: "read only" },
    { key: "portalAccess.approval", cs: "úprava se schválením", en: "edit with approval" },
    { key: "portalAccess.edit", cs: "úprava", en: "edit" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration portal keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
