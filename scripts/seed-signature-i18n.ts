// Two personal signatures: sender name (From + {{sender_name}}) and the e-mail text signature ({{signature}}).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "settingsPage.emailSignatureLabel", cs: "Jméno odesílatele v e-mailech", en: "Sender name in e-mails" },
    { key: "settingsPage.emailSignatureHint", cs: "Zobrazí se jako jméno u adresy odesílatele a nahrazuje {{sender_name}}. Prázdné = vaše jméno v účtu.", en: "Shown as the name next to the sender address and replaces {{sender_name}}. Empty = your account display name." },
    { key: "settingsPage.emailBodySignatureLabel", cs: "Podpis v textu e-mailu", en: "Signature in the e-mail text" },
    { key: "settingsPage.emailBodySignaturePlaceholder", cs: "S pozdravem\nPavel Novák\nhlavní vedoucí, tel. 777 123 456", en: "Best regards\nPavel Novák\nhead leader, phone 777 123 456" },
    { key: "settingsPage.emailBodySignatureHint", cs: "Vloží se do textu e-mailu místo {{signature}} (i na více řádků). Prázdné = použije se jméno odesílatele.", en: "Inserted into the e-mail text in place of {{signature}} (multiple lines allowed). Empty = the sender name is used." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} signature keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
