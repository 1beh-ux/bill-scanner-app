// One-off: the org's default category descriptions were seeded in English
// (leftover from milestone-0 scaffolding). This updates the already-live
// category_templates rows to Czech, plus any event_categories rows that were
// copied from a template and never edited since (isFromTemplate=true) — that
// copy is what event settings pages actually display.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { name: string; description: string }[] = [
    { name: "potraviny", description: "Nezbytné jídlo pro vícedenní akci: suroviny na vaření, pečivo, potraviny, svačiny, které lze rozumně zařadit do jídelníčku. U krátkých akcí patří většina jídla spíš do občerstvení, protože jídlo zde často není nezbytné." },
    { name: "občerstvení", description: "Jídlo nebo pití navíc mimo jídelníček: sladkosti, popcorn, zmrzlina, jídlo ze stánků nebo restaurací, občerstvení. U krátkých akcí sem obvykle patří většina jídla místo do potravin." },
    { name: "materiál program", description: "Materiál na aktivity, hry, tvoření a přípravu programu." },
    { name: "materiál provoz LT", description: "Provozní materiál tábora: úklidové prostředky, materiál na údržbu, vybavení potřebné k provozu tábora." },
    { name: "doprava účastníků na akci a zpět", description: "Doprava účastníků na akci a zpět." },
    { name: "doprava během tábora - výlety", description: "Doprava během tábora, včetně výletů." },
    { name: "vstupné", description: "Vstupenky, vstupné, atrakce." },
    { name: "odměny", description: "Odměny, ceny, drobné dárky." },
    { name: "autoprovoz", description: "Provozní náklady auta: benzín, parkovné, výdaje spojené s autem." },
    { name: "stravování", description: "Catering, hotová jídla, stravovací služby." },
    { name: "ostatní služby", description: "Ostatní služby." },
    { name: "spotřeba EE, plynu a vody ( paušál PS )", description: "Elektřina, plyn, voda — paušál za energie." },
    { name: "jiné výdaje", description: "Použijte, když je výdaj v pořádku, ale nehodí se do jiné kategorie, nebo když žádná povolená kategorie nesedí." },
    { name: "rezerva", description: "Použijte pouze pokud se účtenka jasně týká rezervního fondu." },
  ];

  for (const row of rows) {
    const template = await prisma.categoryTemplate.updateMany({
      where: { name: row.name },
      data: { description: row.description },
    });
    const events = await prisma.eventCategory.updateMany({
      where: { name: row.name, isFromTemplate: true },
      data: { description: row.description },
    });
    console.log(`  ok: ${row.name} (template x${template.count}, event copies x${events.count})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
