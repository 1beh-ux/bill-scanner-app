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
