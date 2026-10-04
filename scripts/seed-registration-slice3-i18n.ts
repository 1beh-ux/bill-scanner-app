// Registration & membership, slice 3 (docs/registration-slice3-spec.md):
// people (adults too), families, price rules, the public membership form,
// auto-accept, portal v2. Portal/public keys (portal.*, public.*) are read in
// Czech only for now -- they still get an en text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // A. members = people
    { key: "nav.children", cs: "Lidé", en: "People" },
    { key: "children.title", cs: "Lidé", en: "People" },
    { key: "children.intro", cs: "Členové napříč všemi akcemi a roky — děti i dospělí. Účastníci se k osobě propojují podle jména a data narození. Používá se jen u akcí, které mají zapnuté „Připojeno k registraci“ — ostatní akce fungují beze změny.", en: "Members across all events and years — children and adults. Participants are linked by name and birth date. Only used by events with “Connected to registration” on — other events work unchanged." },
    { key: "people.filter", cs: "Zobrazit", en: "Show" },
    { key: "people.filterChildren", cs: "Děti", en: "Children" },
    { key: "people.filterAdults", cs: "Dospělí", en: "Adults" },
    { key: "people.filterAll", cs: "Všichni", en: "Everyone" },
    { key: "people.adult", cs: "dospělý", en: "adult" },
    { key: "people.isAdult", cs: "Dospělý člen (vedoucí, podporovatel…)", en: "Adult member (leader, supporter…)" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 3 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
