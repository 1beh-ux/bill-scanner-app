import type { Metadata } from "next";
import Link from "next/link";

// Public (proxy + isPublicPath treat everything under /login as public, no app chrome).
// Static Czech text on purpose: legal wording should not be editable through Překlady.
export const metadata: Metadata = { title: "Podmínky používání" };

const UPDATED = "9. 11. 2026";

const SECTIONS: [string, string[]][] = [
  ["1. Kdo službu provozuje", [
    "Táborník (tabornik.online) provozuje soukromá osoba, Pavel Skuhrovec (kontakt: pavel.skuhrovec@gmail.com), jako neziskový projekt. Nejde o firmu ani o placenou službu.",
  ]],
  ["2. Testovací provoz a cena", [
    "Služba je ve vývoji a v testovacím provozu. Poskytuje se zdarma, bez smlouvy o úrovni služeb a bez nároku na podporu.",
    "Funkce se mohou kdykoli změnit, přibýt nebo zmizet. Provoz může být přerušen nebo ukončen, i bez předchozího oznámení.",
    "Případné budoucí zpoplatnění bude oznámeno předem; bez vašeho souhlasu vám nic účtováno nebude.",
  ]],
  ["3. Bez záruky, na vlastní odpovědnost", [
    "Služba se poskytuje „tak, jak je“. Provozovatel neručí za její dostupnost, bezchybnost ani za to, že se hodí pro váš účel.",
    "Výstupy aplikace (AI přečtené účtenky, přepočty kurzů, cestovní náhrady, souhrny, alergeny v kuchyni, výdej léků) jsou pomůcka. Za jejich kontrolu, za účetnictví, za zdraví a bezpečnost účastníků i za rozhodnutí na jejich základě odpovídá uživatel a jeho organizace.",
    "Provozovatel neodpovídá za ztrátu dat, ušlý zisk ani jinou škodu vzniklou používáním nebo nemožností používání služby, v rozsahu, v jakém to dovoluje právo (to se netýká škody způsobené úmyslně nebo z hrubé nedbalosti).",
    "Důležitá data si průběžně exportujte (export na Google Disk, PDF, CSV). Aplikace není jediné úložiště, na které byste se měli spoléhat.",
  ]],
  ["4. Přístup a účty", [
    "Přístup přiděluje provozovatel ručně organizacím, se kterými se domluví; uvnitř organizace pak přístup lidem dává její správce. Přihlašuje se účtem Google.",
    "Za to, komu organizace přístup dá a co s daty dělá, odpovídá organizace. Přístupové odkazy (rodičovský portál, vyúčtování, kontrola vstupenek) nesdílejte s nepovolanými.",
    "Provozovatel může přístup omezit nebo zrušit, zejména při zneužití, ohrožení bezpečnosti nebo ukončení testovacího provozu.",
  ]],
  ["5. Osobní údaje", [
    "Organizace do aplikace vkládá osobní údaje (účastníci a jejich zákonní zástupci, zdravotní údaje, alergie, dokumenty, platby). Správcem těchto údajů je organizace; provozovatel je pro ni zpracovává jen kvůli provozu aplikace. Organizace odpovídá za to, že má pro jejich zpracování právní důvod a že o něm informovala dotčené osoby.",
    "Vkládejte jen údaje, které pro akci opravdu potřebujete.",
    "Data běží na Google Cloud v EU (Frankfurt). K provozu se používají služby Google (Cloud, Firebase přihlášení, Gmail a Disk připojené organizací, AI Gemini přes EU endpoint pro čtení účtenek) a případně Fio banka, pokud ji organizace připojí. Data se neprodávají a nepoužívají k reklamě.",
    "O export nebo smazání dat organizace požádá e-mailem. Při ukončení testovacího provozu dá provozovatel vědět s předstihem, aby si organizace mohly data stáhnout; poté mohou být smazána.",
  ]],
  ["6. Obsah a zakázané použití", [
    "Data, která do aplikace vložíte, zůstávají vaše. Provozovateli dáváte jen oprávnění je ukládat a zpracovávat v rozsahu nutném pro provoz.",
    "Aplikaci nepoužívejte k ničemu protiprávnímu, nezkoušejte obcházet její zabezpečení a nezatěžujte ji automatizovanými dotazy. Nalezenou chybu zabezpečení prosím nahlaste e-mailem.",
  ]],
  ["7. Změny a závěrečná ustanovení", [
    "Podmínky se mohou změnit; aktuální znění je vždy na této stránce. Dalším používáním aplikace se změněným zněním souhlasíte.",
    "Řídí se právem České republiky.",
  ]],
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/login" className="text-[13px] text-ember hover:text-ember-hover">← Zpět na úvod</Link>
        <div>
          <h1 className="mb-2 text-[28px] font-medium">Podmínky používání</h1>
          <p className="text-[13px] text-ink-secondary">Platné od {UPDATED}. Testovací provoz, služba zdarma.</p>
        </div>
        {SECTIONS.map(([title, paras]) => (
          <section key={title} className="flex flex-col gap-2">
            <h2 className="text-[16px] font-medium">{title}</h2>
            {paras.map((p) => (
              <p key={p} className="text-[14px] leading-relaxed text-ink-secondary">{p}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
