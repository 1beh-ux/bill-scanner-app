// 2026-10-22: Členové in the menu, adult select options, editable public texts. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("nav.children", "Členové", "Members"),
  r("children.title", "Členové", "Members"),
  r("participantFieldAdmin.adultOptionsLabel", "Možnosti pro dospělé (nepovinné)", "Options for adults (optional)"),
  r("participantFieldAdmin.adultOptionsPlaceholder", "např. Žena, Muž – prázdné = stejné jako výše", "e.g. Woman, Man – empty = the same as above"),
  r("publicTexts.title", "Texty veřejných stránek", "Public page texts"),
  r("publicTexts.hint", "Vlastní znění textů přihlášky (formulář, potvrzení po odeslání, odkaz do portálu) a rodičovského portálu (přihlášky, platby, dokumenty, profil). Platí pro všechny akce; každá akce si texty své přihlášky může ještě upravit v Nastavení akce → Veřejná přihláška. Prázdné pole = výchozí text. Údaje ve složených závorkách, např. {name}, {date}, {n}, se doplní samy – nechte je v textu.", "Your own wording of the registration texts (the form, the confirmation after sending, the portal link) and the parent portal (registrations, payments, documents, profile). Applies to every event; each event can adjust its registration texts in Event settings → Public registration. Empty = the default. Values in curly braces, e.g. {name}, {date}, {n}, are filled in – keep them."),
  r("publicTexts.eventTitle", "Texty přihlášky této akce", "This event's registration texts"),
  r("publicTexts.eventHint", "Jen pro stránku přihlášky této akce (i vloženou na web). Co necháte prázdné, se řídí textem organizace (Organizace → Vzhled veřejných stránek), jinak výchozím. Texty v rodičovském portálu se nastavují pro celou organizaci tamtéž.", "Only for this event's registration page (embedded too). Anything left empty follows the organization's text (Organization → Public pages appearance), else the default. Parent portal texts are set for the whole organization there."),
  r("publicTexts.open", "Upravit texty", "Edit the texts"),
  r("publicTexts.changedCount", "upraveno: {n}", "changed: {n}"),
  r("publicTexts.part.all", "Vše", "All"),
  r("publicTexts.part.form", "Přihláška", "Registration"),
  r("publicTexts.part.portal", "Rodičovský portál", "Parent portal"),
  r("publicTexts.part.changed", "Upravené", "Changed"),
  r("publicTexts.search", "Hledat text…", "Search the texts…"),
  r("publicTexts.none", "Nic nenalezeno.", "Nothing found."),
  r("publicTexts.orgValue", "Organizace: {text}", "Organization: {text}"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} public texts keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
