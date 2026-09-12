// One-off: pushes the registration-document merge-variable registry into
// the live merge_variables table. Same pattern as the other seed-*-i18n.ts
// scripts -- prisma/seed.ts only seeds a fresh install, not this database.
// Variable names/mapping taken from the real production templates in
// Pavel's Drive ("Templaty (přihláška, lékař)" folder) -- both
// {{zast_jmeno}} and {{zak_zast_jmeno}} map to the same guardian-name
// resolver since the two templates never agreed on a name for that field.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; sourceType: string; sourceField: string; label: string }[] = [
    { key: "Name", sourceType: "participant_field", sourceField: "name", label: "Jméno a příjmení dítěte" },
    { key: "datum_narozeni", sourceType: "participant_field", sourceField: "dateOfBirth", label: "Datum narození" },
    { key: "adresa", sourceType: "participant_field", sourceField: "address", label: "Adresa trvalého bydliště" },
    { key: "pojistovna", sourceType: "participant_field", sourceField: "healthInsurance", label: "Zdravotní pojišťovna" },
    { key: "pohlavi", sourceType: "participant_field", sourceField: "gender", label: "Pohlaví" },
    { key: "clenstvi_zare", sourceType: "participant_field", sourceField: "isMember", label: "Členství v organizaci (Ano/Ne)" },
    { key: "vydani_osoby", sourceType: "participant_field", sourceField: "releasePersons", label: "Osoby, kterým lze dítě vydat" },
    { key: "zast_jmeno", sourceType: "guardian_field", sourceField: "name", label: "Jméno zákonného zástupce" },
    { key: "zak_zast_jmeno", sourceType: "guardian_field", sourceField: "name", label: "Jméno zákonného zástupce (posudek)" },
    { key: "vztah", sourceType: "guardian_field", sourceField: "relationship", label: "Vztah k dítěti" },
    { key: "zast_telefon", sourceType: "guardian_field", sourceField: "phone", label: "Telefon zákonného zástupce" },
    { key: "Email", sourceType: "guardian_field", sourceField: "email", label: "Kontaktní e-mail" },
    { key: "price", sourceType: "computed", sourceField: "effective_price", label: "Cena (dle členství)" },
    { key: "var_symb", sourceType: "computed", sourceField: "variable_symbol", label: "Variabilní symbol platby" },
    { key: "picture", sourceType: "computed", sourceField: "payment_qr_image", label: "QR kód pro platbu" },
  ];

  for (const row of rows) {
    await prisma.mergeVariable.upsert({
      where: { key: row.key },
      update: { sourceType: row.sourceType as never, sourceField: row.sourceField, label: row.label },
      create: { ...row, sourceType: row.sourceType as never },
    });
    console.log(`  ok: ${row.key}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
