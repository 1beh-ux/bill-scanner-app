// Appearance layers (2026-10-22): portal base + embed / registration layers + the event's own. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("appearance.subtitle", "Písmo, velikosti, barevný režim, pozadí a šířka veřejných stránek. Administrace Táborníku se nemění.", "Font, sizes, colour mode, background and width of the public pages. The admin app is unchanged."),
  r("appearance.tab.base", "Rodičovský portál", "Parent portal"),
  r("appearance.tab.embed", "Vložené na web", "Embedded on a website"),
  r("appearance.tab.registration", "Veřejná přihláška", "Public registration"),
  r("appearance.tabHint.base", "Základní vzhled: platí pro rodičovský portál na vlastní adrese a ostatní záložky z něj vycházejí.", "The base look: used by the parent portal on its own address; the other tabs build on it."),
  r("appearance.tabHint.embed", "Stránky vložené do jiného webu (přihláška, vstupenky i portál přes kód z „Vložit na web“). U každé položky můžete nechat „Jako rodičovský portál“, nebo nastavit vlastní hodnotu.", "Pages embedded in another website (registration, tickets and the portal via the “Embed on a website” code). Leave each item “Like the parent portal” or set its own value."),
  r("appearance.tabHint.registration", "Veřejná přihláška a prodej vstupenek otevřené na vlastní adrese (ne vložené). Každá akce si to může v Nastavení akce → Veřejná přihláška ještě upravit.", "The public registration and ticket pages opened on their own address (not embedded). Each event can adjust this further in Event settings → Public registration."),
  r("appearance.inheritPortal", "Jako rodičovský portál", "Like the parent portal"),
  r("appearance.inheritOrg", "Podle nastavení organizace", "As the organization's setting"),
  r("appearance.withBackground", "S pozadím", "With a background"),
  r("appearance.resetLayer", "Vše podle výchozího", "Inherit everything"),
  r("appearance.eventTitle", "Vzhled stránky této akce", "This event's page look"),
  r("appearance.eventSubtitle", "Jen pro přihlášku / vstupenky této akce, na vlastní adrese i vložené na web. Co necháte „Podle nastavení organizace“, se řídí Organizace → Vzhled veřejných stránek.", "Only for this event's registration / ticket page, on its own address and embedded. Anything left “As the organization's setting” follows Organization → Public pages appearance."),
  r("appearance.darkTransparentWarn", "Tmavý režim bez pozadí se hodí jen na web s tmavým pozadím – jinak bude světlý text na světlém podkladu.", "Dark mode without a background only suits a website with a dark background – otherwise it's light text on a light page."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} appearance layer keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
