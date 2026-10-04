// Registration & membership, slice 1: Děti page, event registration settings.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "nav.children", cs: "Děti", en: "Children" },
    { key: "children.title", cs: "Děti", en: "Children" },
    { key: "children.intro", cs: "Jedno dítě napříč všemi akcemi a roky. Účastníci se k dítěti propojují podle jména a data narození. Používá se jen u akcí, které mají zapnuté „Připojeno k registraci“ — ostatní akce fungují beze změny.", en: "One child across all events and years. Participants are linked by name and birth date. Only used by events with “Connected to registration” on — other events work unchanged." },
    { key: "children.seedButton", cs: "Propojit účastníky všech akcí", en: "Link participants of all events" },
    { key: "children.seedDone", cs: "Propojeno účastníků: {linked}, nových dětí: {created}.", en: "Participants linked: {linked}, new children: {created}." },
    { key: "children.search", cs: "Hledat jméno", en: "Search name" },
    { key: "children.errorFailed", cs: "Akce se nepodařila.", en: "That didn't work." },
    { key: "children.mergeConfirm", cs: "Sloučit {count} další záznam(y) do „{name}“? Jejich účasti na akcích se přesunou k tomuto dítěti.", en: "Merge {count} other record(s) into “{name}”? Their event registrations move to this child." },
    { key: "children.pickFromList", cs: "Vyberte dítě ze seznamu.", en: "Pick a child from the list." },
    { key: "children.membershipChip", cs: "Členství {year}", en: "Membership {year}" },
    { key: "children.pending", cs: "nepřijato", en: "not accepted" },
    { key: "children.duplicatesTitle", cs: "Možné duplicity", en: "Possible duplicates" },
    { key: "children.duplicatesHint", cs: "Stejné jméno, jiné nebo chybějící datum narození. Pokud jde o jedno dítě, klikněte u správného záznamu na „Ponechat tento“.", en: "Same name, different or missing birth date. If it's one child, click “Keep this” on the right record." },
    { key: "children.keepThis", cs: "Ponechat tento", en: "Keep this" },
    { key: "children.unlinkedTitle", cs: "Nepropojení účastníci ({count})", en: "Unlinked participants ({count})" },
    { key: "children.unlinkedHint", cs: "Bez data narození se nepropojují automaticky. Vyberte dítě, nebo založte nové.", en: "Without a birth date they aren't linked automatically. Pick a child or create a new one." },
    { key: "children.linkPlaceholder", cs: "Dítě…", en: "Child…" },
    { key: "children.link", cs: "Propojit", en: "Link" },
    { key: "children.newChild", cs: "Nové dítě", en: "New child" },
    { key: "children.listTitle", cs: "Všechny děti ({count})", en: "All children ({count})" },
    { key: "children.empty", cs: "Zatím žádné děti — začněte tlačítkem „Propojit účastníky všech akcí“.", en: "No children yet — start with “Link participants of all events”." },
    { key: "children.colBirth", cs: "Datum narození", en: "Birth date" },
    { key: "children.colEvents", cs: "Akce", en: "Events" },
    { key: "registrationSettings.title", cs: "Registrace a členství", en: "Registration & membership" },
    { key: "registrationSettings.hint", cs: "Vše je volitelné. Když je vypnuto, akce funguje přesně jako dosud.", en: "All optional. With it off, the event works exactly as before." },
    { key: "registrationSettings.connected", cs: "Připojeno k registraci", en: "Connected to registration" },
    { key: "registrationSettings.connectedHint", cs: "Účastníci se propojí s dětmi. U běžné akce se pak člen pozná i podle přijaté přihlášky do členského roku (podle roku začátku akce) — ruční pole členství platí dál.", en: "Participants get linked to children. In a regular event, a child also counts as a member from an accepted membership-year registration (by the event's start year) — the manual membership field still applies." },
    { key: "registrationSettings.kind", cs: "Typ akce", en: "Event type" },
    { key: "registrationSettings.kindEvent", cs: "Akce (tábor, výprava…)", en: "Event (camp, trip…)" },
    { key: "registrationSettings.kindMembership", cs: "Členský rok", en: "Membership year" },
    { key: "registrationSettings.year", cs: "Rok členství", en: "Membership year" },
    { key: "registrationSettings.yearHint", cs: "Přijatí účastníci této akce jsou členy pro tento rok.", en: "Accepted participants of this event are members for this year." },
    { key: "registrationSettings.badYear", cs: "Zadejte platný rok.", en: "Enter a valid year." },
    { key: "registrationSettings.saveFailed", cs: "Nastavení se nepodařilo uložit.", en: "Couldn't save the settings." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
