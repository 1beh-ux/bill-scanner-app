// Registration & membership, slice 8 (docs/registration-slice8-spec.md): portal
// "Přidat člena rodiny" / "Už nebude chodit", inactive people, selective linking.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // 1. Portal: add a family member
    { key: "portal.addMember", cs: "Přidat člena rodiny", en: "Add a family member" },
    { key: "portal.addMemberHint", cs: "Nový člen se přidá do rodiny (ne na akci). Správce ho zkontroluje; nic se neodesílá.", en: "The new member joins the family (not an event). The admin reviews it; nothing is sent." },
    { key: "portal.addMemberChild", cs: "Dítě", en: "Child" },
    { key: "portal.addMemberAdult", cs: "Dospělý", en: "Adult" },
    { key: "portal.firstName", cs: "Jméno", en: "First name" },
    { key: "portal.lastName", cs: "Příjmení", en: "Last name" },
    { key: "portal.birthDate", cs: "Datum narození", en: "Date of birth" },
    { key: "portal.addMemberSubmit", cs: "Přidat", en: "Add" },
    { key: "portal.addMemberDone", cs: "Přidáno. Člen je v rodině; správce údaje zkontroluje.", en: "Added. The member is in the family; the admin will review the details." },
    { key: "portal.addMemberInvalid", cs: "Zkontrolujte údaje: jméno, příjmení, datum narození, povinná pole a e-mail (dospělý) nebo aspoň jednoho rodiče s e-mailem (dítě).", en: "Check the details: name, birth date, required fields and an e-mail (adult) or at least one guardian with an e-mail (child)." },
    { key: "portal.addMemberThrottled", cs: "Dnes už bylo přidáno příliš mnoho členů. Zkuste to zítra.", en: "Too many members added today. Try again tomorrow." },
    // 2. "Už nebude chodit" / inactive people
    { key: "portal.leave", cs: "Už nebude chodit", en: "Won't attend any more" },
    { key: "portal.leaveConfirm", cs: "{name} už nebude chodit? Přesune se mezi neaktivní a nepůjde přihlásit na další akce. Stávající přihlášky zůstávají — správce se ozve, co s nimi.", en: "{name} won't attend any more? They move to inactive and can't be registered for further events. Existing registrations stay — the admin will get in touch about them." },
    { key: "portal.leaveNote", cs: "Poznámka pro správce (nepovinné)", en: "Note for the admin (optional)" },
    { key: "portal.leaveSubmit", cs: "Potvrdit", en: "Confirm" },
    { key: "portal.inactive", cs: "Neaktivní ({count})", en: "Inactive ({count})" },
    { key: "portal.inactiveSince", cs: "od {date}", en: "since {date}" },
    { key: "portal.restore", cs: "Obnovit", en: "Restore" },
    { key: "portal.inactiveHint", cs: "Neaktivní osobu nejde přihlásit na akci. Obnovit ji můžete kdykoli.", en: "An inactive person can't be registered for an event. You can restore them any time." },
    { key: "people.inactive", cs: "Neaktivní", en: "Inactive" },
    { key: "people.active", cs: "Aktivní", en: "Active" },
    { key: "people.filterActive", cs: "Aktivní i neaktivní", en: "Active and inactive" },
    { key: "people.leftViaPortal", cs: "od {date}, označil(a) rodič v portálu", en: "since {date}, marked by a parent in the portal" },
    { key: "people.leftViaAdmin", cs: "od {date}, označil správce", en: "since {date}, marked by an admin" },
    { key: "people.inactiveSkipped", cs: "neaktivní vynecháno: {count}", en: "inactive skipped: {count}" },
    { key: "portalCompose.inactiveSkipped", cs: "neaktivní vynecháno: {count}", en: "inactive skipped: {count}" },
    { key: "participantsPage.personLeftPortal", cs: "Odhlášen(a) rodičem {date}", en: "Withdrawn by a parent {date}" },
    { key: "participantsPage.personLeftAdmin", cs: "Neaktivní v Lidech od {date}", en: "Inactive in People since {date}" },
    // 3. Selective linking
    { key: "registrationSettings.linkMode", cs: "Koho propojovat s Lidmi", en: "Whom to link to People" },
    { key: "registrationSettings.linkMode.all", cs: "Všechny účastníky", en: "All participants" },
    { key: "registrationSettings.linkModeHint.all", cs: "Kdo v Lidech ještě není, přidá se.", en: "Anyone not in People yet is added." },
    { key: "registrationSettings.linkMode.existing", cs: "Jen stávající osoby", en: "Existing people only" },
    { key: "registrationSettings.linkModeHint.existing", cs: "Propojí jen účastníky, kteří už v Lidech jsou (např. členy kvůli členské ceně); nikoho nového nepřidá. Ostatní lze propojit ručně v seznamu účastníků (Propojit s Lidmi).", en: "Links only participants already in People (e.g. members, for member prices); adds nobody new. Others can be linked by hand in the participant list (Link to People)." },
    { key: "participantsPage.bulkLinkButton", cs: "Propojit s Lidmi", en: "Link to People" },
    { key: "participantsPage.bulkLinkHint", cs: "Propojí vybrané účastníky s osobami v Lidech podle jména a data narození; kdo tam není, přidá se. Nic se neodesílá.", en: "Links the selected participants to people in People by name and birth date; anyone missing is added. Nothing is sent." },
    { key: "participantsPage.bulkLinkResult", cs: "Propojeno: {linked} (nově v Lidech: {created}). Nepropojeno (chybí datum narození nebo nejednoznačné — viz Lidé): {notLinked}.", en: "Linked: {linked} (new in People: {created}). Not linked (no birth date or ambiguous — see People): {notLinked}." },
    { key: "participantsPage.bulkLinkSend", cs: "Poslat odkaz do portálu ({count})", en: "Send portal link ({count})" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 8 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
