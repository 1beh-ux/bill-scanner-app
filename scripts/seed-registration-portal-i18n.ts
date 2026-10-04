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
