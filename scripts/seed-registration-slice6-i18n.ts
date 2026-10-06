// Registration & membership, slice 6 (docs/registration-slice6-spec.md):
// permanent documents on the person. Portal keys (portal.*) are read in
// Czech only for now -- they still get an en text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // 1. setting (Šablony → Dokumenty; event document types)
    { key: "personDocs.permanent", cs: "platí trvale", en: "valid permanently" },
    { key: "personDocs.permanentHint", cs: "Dokument se uloží k osobě a platí pro všechny další akce, dokud ho neoznačíte jako neplatný.", en: "Stored on the person and valid for every later event until marked invalid." },
    { key: "personDocs.enableConfirm", cs: "„{name}“ bude platit trvale. Z již přijatých souborů (ne z odškrtnutí ani z vytvořených dokumentů) vznikne dokument v profilu u {count} lidí. Pokračovat?", en: "“{name}” will be valid permanently. {count} people get a profile document from files already received (not from ticks or generated documents). Continue?" },
    { key: "personDocs.disableConfirm", cs: "„{name}“ přestane platit trvale. Dokumenty v profilech zůstanou uložené, ale akce je přestanou počítat. Pokračovat?", en: "“{name}” will no longer be permanent. Profile documents stay stored but events stop counting them. Continue?" },
    { key: "personDocs.enabled", cs: "Zapnuto. Vytvořeno dokumentů v profilech: {count}.", en: "Switched on. Profile documents created: {count}." },
    { key: "personDocs.permanentBadge", cs: "platí trvale", en: "permanent" },
    { key: "personDocs.requireNewBadge", cs: "platí trvale — zde vyžadovat nový", en: "permanent — new one required here" },
    { key: "personDocs.requireNew", cs: "Vyžadovat nový", en: "Require a new one" },
    { key: "personDocs.requireNewHint", cs: "Tato akce nepočítá dokument uložený v profilu a chce nový.", en: "This event ignores the document stored on the profile and asks for a new one." },
    // 3. admin upload
    { key: "personDocs.upload", cs: "Nahrát soubor", en: "Upload file" },
    // 3, 5. person page
    { key: "personDocs.title", cs: "Trvalé dokumenty", en: "Permanent documents" },
    { key: "personDocs.hint", cs: "Platí pro všechny akce, dokud je neoznačíte „Neplatí“.", en: "Valid for every event until marked “Invalid”." },
    { key: "personDocs.notPermanent", cs: "už neplatí trvale", en: "no longer permanent" },
    { key: "personDocs.none", cs: "Chybí", en: "Missing" },
    { key: "personDocs.fromEvent", cs: "z akce {event}", en: "from {event}" },
    { key: "personDocs.uploadedHere", cs: "nahráno zde", en: "uploaded here" },
    { key: "personDocs.current", cs: "platný", en: "valid" },
    { key: "personDocs.revokedOn", cs: "neplatí od {date}", en: "invalid since {date}" },
    { key: "personDocs.revoke", cs: "Neplatí", en: "Invalid" },
    { key: "personDocs.revokeConfirm", cs: "Označit „{name}“ jako neplatný? Všechny akce (i minulé) ho od teď počítají jako chybějící.", en: "Mark “{name}” as invalid? Every event (past ones too) counts it as missing from now on." },
    // 4. counting
    { key: "personDocs.fromProfile", cs: "z profilu", en: "from the profile" },
    { key: "personDocs.fromProfileEvent", cs: "z profilu ({event})", en: "from the profile ({event})" },
    { key: "personDocs.fromProfileHint", cs: "Trvalý dokument uložený u osoby (Lidé). Zneplatnit ho lze tam.", en: "Permanent document stored on the person (People). It can be marked invalid there." },
    { key: "portal.docFromProfile", cs: "Máme z profilu", en: "On file in the profile" },
    { key: "portal.docFromProfileEvent", cs: "Máme z profilu ({event})", en: "On file in the profile ({event})" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 6 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
