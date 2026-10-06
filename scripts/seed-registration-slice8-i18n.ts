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
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 8 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
