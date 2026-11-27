// Registration & membership, slice 5 (docs/registration-slice5-spec.md):
// basic vs. detailed data, per-event required fields. Portal keys (portal.*)
// are read in Czech only for now -- they still get an en text. Run after the
// slice-4 seed (it overwrites childProfile.profileTitle).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "participantFieldAdmin.vsYearLabel", cs: "Rok (2 číslice, prázdné = podle začátku akce)", en: "Year (2 digits, empty = from event start)" },
    { key: "participantFieldAdmin.fromEventsHint", cs: "Pole, která zatím existují jen v akcích. Zaškrtnutá se stanou šablonami (podle nejnovější akce); akce samotné se nemění. Rodičům se pole ukážou až po nastavení sloupce „Rodiče v portálu“.", en: "Fields that exist only in events. Ticked ones become templates (newest event's version); the events don't change. Parents see a field only once its “Parents in portal” column is set." },
    { key: "participantFieldAdmin.fromEventsAll", cs: "Vybrat vše", en: "Select all" },
    { key: "participantFieldAdmin.fromEventsApply", cs: "Vytvořit šablony ({count})", en: "Create templates ({count})" },
    // 1-2. field settings (Šablony → Účastníci, event participant fields)
    { key: "fieldMeta.audience.title", cs: "Pro koho", en: "For whom" },
    { key: "fieldMeta.audience.both", cs: "děti i dospělí", en: "children and adults" },
    { key: "fieldMeta.audience.children", cs: "jen děti", en: "children only" },
    { key: "fieldMeta.audience.adults", cs: "jen dospělí", en: "adults only" },
    { key: "fieldMeta.level.title", cs: "Údaje", en: "Details" },
    { key: "fieldMeta.level.basic", cs: "základní", en: "basic" },
    { key: "fieldMeta.level.detailed", cs: "podrobné (jen když je akce potřebuje)", en: "detailed (only when an event needs them)" },
    { key: "fieldMeta.required.title", cs: "Vyžadovat při přihlášce", en: "Required on registration" },
    { key: "fieldMeta.required.hidden", cs: "rodiče toto pole nevidí", en: "parents can't see this field" },
    { key: "fieldMeta.required.eventQuestion", cs: "otázka akce — uloží se jen k přihlášce", en: "event question — stored with the registration only" },
    // 3. registration step
    { key: "portal.stepTitle", cs: "Údaje pro přihlášku", en: "Details for the registration" },
    { key: "portal.stepSavedToProfile", cs: "Údaje z profilu se po odeslání uloží i do profilu (pole „se schválením“ až po schválení).", en: "Profile details are also saved to the profile (fields “with approval” once approved)." },
    { key: "portal.stepReviewed", cs: "Údaje jsou aktuální — zkontroloval(a) jsem je.", en: "The details are up to date — I've checked them." },
    { key: "portal.fieldOptional", cs: "nepovinné", en: "optional" },
    { key: "portal.fieldInvalid", cs: "Špatný formát – opravte hodnotu, nebo ji smažte, pokud není povinná.", en: "Wrong format – fix the value, or clear it if it isn't required." },
    { key: "portal.fieldMissing", cs: "Povinné – vyplňte prosím.", en: "Required – please fill in." },
    { key: "portal.requiredLegend", cs: "Pole označená * jsou povinná.", en: "Fields marked * are required." },
    { key: "portal.stepFixMarked", cs: "Doplňte nebo opravte pole označená červeně – pak půjde přihlášku odeslat.", en: "Fill in or fix the fields marked in red – then the registration can be sent." },
    { key: "participantDetail.generateDoc", cs: "Vytvořit", en: "Create" },
    { key: "participantDetail.generateDocHint", cs: "Vytvoří dokument z jeho šablony pro tohoto účastníka a otevře PDF (nic se neposílá). Jako „přijatý“ se počítá až podepsaný soubor, který nahrajete.", en: "Creates the document from its template for this participant and opens the PDF (nothing is sent). Only the signed file you upload counts as received." },
    { key: "participantDetail.generateDocFailed", cs: "Dokument se nepodařilo vytvořit (zkontrolujte šablonu v Google Docs).", en: "The document couldn't be created (check the template in Google Docs)." },
    { key: "public.err.email_duplicate", cs: "tento e-mail už má jiný zákonný zástupce – každý potřebuje vlastní", en: "another guardian already has this e-mail – each needs their own" },
    { key: "portal.docGenerate", cs: "Stáhnout k vyplnění a podpisu", en: "Download to fill in and sign" },
    { key: "portal.docGenerateFailed", cs: "Dokument se teď nepodařilo připravit. Zkuste to prosím později.", en: "The document couldn't be prepared right now. Please try again later." },
    { key: "public.primaryTitle", cs: "Registruji primárně:", en: "I'm registering mainly:" },
    { key: "public.primaryChild", cs: "Dítě", en: "A child" },
    { key: "public.primaryAdult", cs: "Dospělého (sebe)", en: "An adult (myself)" },
    { key: "public.primaryHint", cs: "Další děti nebo dospělé přidáte potom tlačítky pod formulářem.", en: "More children or adults can be added afterwards with the buttons below the form." },
    { key: "person.ownContactTitle", cs: "E-mail a telefon", en: "E-mail and phone" },
    { key: "person.adultGuardiansTitle", cs: "Zákonní zástupci (jen pokud je dospělý má)", en: "Guardians (only if the adult has any)" },
    { key: "person.addOwnContact", cs: "Přidat e-mail a telefon", en: "Add e-mail and phone" },
    { key: "person.ownContactHint", cs: "Vlastní kontakt dospělého – na tento e-mail chodí pošta a odkaz do portálu. Zákonné zástupce dospělý obvykle nemá.", en: "The adult's own contact – mail and the portal link go to this e-mail. An adult usually has no guardians." },
    { key: "portal.ownContactTitle", cs: "E-mail a telefon", en: "E-mail and phone" },
    { key: "portal.adultGuardiansTitle", cs: "Zákonní zástupci (jen pokud je máte)", en: "Guardians (only if you have any)" },
    { key: "portal.ownEmail", cs: "Váš e-mail", en: "Your e-mail" },
    { key: "priceRules.byAnswer", cs: "Kategorie podle odpovědi na „{field}“ (bez výběru kategorie)", en: "Category by the answer to “{field}” (no category choice)" },
    { key: "priceRules.byAnswerHint", cs: "Ke každé možnosti vyberte cenovou kategorii. Kategorie, která pro člověka neplatí (např. dětská u dospělého), se nahradí jeho první povolenou.", en: "Pick a price category for each option. A category that doesn't apply to the person (e.g. a children's one for an adult) is replaced by their first allowed one." },
    { key: "priceRules.byAnswerFirst", cs: "— první povolená kategorie —", en: "— first allowed category —" },
    { key: "priceRules.categoryShow", cs: "Kategorie ve formuláři:", en: "Category on the form:" },
    { key: "priceRules.showReadonly", cs: "ukázat (jen pro čtení, s cenou)", en: "show (read-only, with the price)" },
    { key: "priceRules.showHidden", cs: "neukazovat (jen cena)", en: "don't show (price only)" },
    { key: "priceRules.byAnswerEmpty", cs: "Zatím není přiřazená žádná možnost – dokud nebude, vybírá si kategorii člověk jako dřív.", en: "No option is assigned yet – until one is, people pick the category as before." },
    { key: "listTemplateAdmin.attachOnlyIfMissing", cs: "…jen když ho člověk ještě nemá", en: "…only when the person doesn't have it yet" },
    { key: "listTemplateAdmin.attachOnlyIfMissingHint", cs: "Nový člověk dokument dostane; kdo ho už má (přijatý u této přihlášky, platný trvalý v profilu nebo splněný podrobnými údaji), ho znovu nedostane – nic se mu nevytváří ani neposílá.", en: "A new person gets the document; someone who already has it (received for this registration, a valid permanent one on the profile, or done by the details) doesn't get it again – nothing is created or sent to them." },
    { key: "personDocs.fromProfileNoFileHint", cs: "Odevzdáno v dřívější akci (zaškrtnuto, bez souboru) – platí trvale, není co otevřít.", en: "Handed in for an earlier event (ticked, no file) – permanent, nothing to open." },
    { key: "participantDetail.docSent", cs: "odesláno {date}", en: "sent {date}" },
    { key: "portal.stepCheck", cs: "Zkontrolujte prosím:", en: "Please check:" },
    { key: "portal.stepInvalidValue", cs: "hodnota má špatný formát (opravte ji, nebo ji smažte, pokud není povinná)", en: "the value has the wrong format (fix it, or clear it if it isn't required)" },
    { key: "portal.stepMissingValue", cs: "chybí", en: "missing" },
    { key: "portal.stepIncomplete", cs: "Vyplňte prosím všechna povinná pole a potvrďte, že jsou údaje aktuální.", en: "Please fill in all required fields and confirm the details are up to date." },
    // 4. profile: basic + detailed
    { key: "portal.basicTitle", cs: "Základní údaje", en: "Basic details" },
    { key: "portal.detailedTitle", cs: "Podrobné údaje", en: "Detailed information" },
    { key: "portal.openDetailed", cs: "Podrobné údaje →", en: "Detailed information →" },
    { key: "portal.backToBasic", cs: "← Základní údaje", en: "← Basic details" },
    { key: "portal.detailedMissing", cs: "{n} chybí", en: "{n} missing" },
    { key: "portal.detailedHint", cs: "Údaje, které potřebujeme jen pro některé akce. Přihláška vás o ně požádá; vyplnit je můžete i předem.", en: "Details needed only for some events. A registration asks for them; you can also fill them in beforehand." },
    { key: "portal.requiredBy", cs: "Vyžaduje přihláška: {event}", en: "Required by the registration: {event}" },
    { key: "childProfile.profileTitle", cs: "Základní údaje", en: "Basic details" },
    { key: "childProfile.detailedTitle", cs: "Podrobné údaje", en: "Detailed information" },
    { key: "childProfile.detailedHint", cs: "Rodiče je vyplňují až při přihlášce na akci, která je vyžaduje.", en: "Parents fill these in when registering for an event that requires them." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 5 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
