// In-app help (Nápověda, /napoveda) -- the single source of the topic texts.
// The later click-by-click wizard reads the same topics, so keep them here
// rather than in components. Body format (rendered by src/app/napoveda/page.tsx):
// blank line = new paragraph, "- " = bullet, "1. " = numbered step, `code`.
// Czech only for now; the PDF manual (public/napoveda/) has the same content with screenshots.

export type HelpTopic = { slug: string; title: string; body: string };

export const HELP_PDF_PATH = "/napoveda/bill-scanner-v2-prirucka.pdf";

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: "uvod",
    title: "Úvod",
    body: `Aplikaci používá hlavně organizátor akce (nahrává a schvaluje účtenky, spravuje účastníky) a účetní organizace (přebírá schválené účtenky a plátce napříč akcemi). Přihlašuje se Google účtem.

Vlevo nahoře je přepínač aktuální akce — vše, co v menu vidíte, se týká vybrané akce.

V Nastavení akce najdete stav přípravy nové akce: „Akce je připravená: X / Y“ ukazuje, co ještě chybí. Přepínači Moduly zapínáte a vypínáte moduly (Zdraví, Pošta…) — vypnutý modul zmizí z menu, ale jeho data zůstanou zachována.`,
  },
  {
    slug: "uctenky",
    title: "Účtenky",
    body: `1. Klikněte na „Nahrát účtenky“ a vyberte způsob: nahrát soubor, vyfotit, import z Google Drive nebo z tabulky.
2. AI účtenku přečte a předvyplní obchod, datum, částku a kategorii. Zkontrolujte údaje a případně účtenku rozdělte do více kategorií — součet musí odpovídat celkové částce.
3. Vyberte Plátce (kdo účtenku zaplatil) a stav platby (Proplaceno / Neproplaceno) — podle něj vidíte, komu ještě organizace dluží peníze.
4. Tlačítkem Schválit účtenku potvrdíte — schválené účtenky se již nepřepočítávají při změně kurzu a jsou připravené k exportu pro účetní (Nastavení akce → Připojení → Exportovat do Drive).

Vícestránkové PDF s více účtenkami se při importu automaticky rozdělí na jednotlivé stránky / účtenky.`,
  },
  {
    slug: "kategorie-a-rozpocty",
    title: "Nastavení akce: Kategorie a rozpočty",
    body: `Ke každé akci patří vlastní seznam kategorií účtenek (např. Doprava, Strava, Materiál) a u každé kategorie volitelný rozpočet v Kč (Nastavení akce → Účtenky).

Rozpočet 0 znamená „bez rozpočtu“ — čerpání se u takové kategorie nesleduje jako překročené. Skutečné čerpání sledujte na stránce Rozpočet v levém menu.

Tip: kategorie si nastavte dřív, než začnete nahrávat účtenky.`,
  },
  {
    slug: "platci",
    title: "Plátci",
    body: `Plátce je osoba, která za akci platí z vlastních peněz a které se účtenky napřímo proplácejí (např. hlavní vedoucí). Seznam pro konkrétní akci je pod Plátci v levém menu.

Nového plátce přidáte tlačítkem Nový plátce — jméno a bankovní účet. Bankovní údaje vidí jen administrátor a účetní.

Plátce se přiřazuje ke konkrétní účtence v poli Plátce — podle toho se pozná, komu se má částka proplatit a jaký je stav. Stejný člověk může být plátcem ve více akcích — přehled za celou organizaci je pod Organizace → Plátci (všechny akce).`,
  },
  {
    slug: "pripojeni",
    title: "Nastavení akce: Připojení (Disk a schránka)",
    body: `Aby akce mohla importovat účtenky a odesílat e-maily, musí mít připojený Google účet k Disku a schránku pro odesílání (Nastavení akce → Připojení).

- Účet pro Disk této akce musí mít roli Editor ke složce pro import i export.
- ID složky pro import / export najdete v adrese složky na Disku, za \`/folders/\`. Tlačítko Otestovat připojení ověří přístup.
- Odesílatel e-mailů — schránka Google Workspace, ze které chodí e-maily rodičům; vlastník ji musí jednorázově povolit.

Bez těchto dvou připojení akce nefunguje.`,
  },
  {
    slug: "ucastnici",
    title: "Účastníci",
    body: `Seznam všech dětí je pod Seznam účastníků. Nového účastníka přidáte tlačítkem + Přidat účastníka (nebo hromadně přes Importovat účastníky): jméno, příjmení, skupina, datum narození a alespoň jeden zákonný zástupce (jméno, e-mail, vztah, telefon) — na tuto adresu chodí všechny automatické e-maily.

Zatržítko „Přijmout hned“ nastaví stav rovnou na Přijato, bez e-mailu. Jinak má nově přidaný účastník stav Čeká — přijmout, dokud registraci nepotvrdíte.`,
  },
  {
    slug: "prijeti-registrace",
    title: "Přijetí registrace",
    body: `U účastníka se stavem Čeká — přijmout klikněte na tento stav a otevře se dialog „Přijmout registraci a odeslat e-mail“. Předmět a text jsou předvyplněné ze šablony s reálnými údaji dítěte — lze je upravit. Zatrhněte, které dokumenty se mají vygenerovat a připojit. Tlačítko Odeslat změní stav na Přijato a pošle e-mail zákonným zástupcům.

Tip: chcete-li jen změnit stav bez e-mailu, odznačte „Odeslat e-mail rodičům“.`,
  },
  {
    slug: "nastaveni-ucastnici-posta",
    title: "Nastavení akce: Účastníci a Pošta",
    body: `Záložka Účastníci definuje, jaká pole se sledují (jméno, adresa, alergie…) a kde se zobrazují.

Záložka Pošta spravuje typy dokumentů (propojené s šablonou v Google Docs) a šablonu hromadného e-mailu o stavu dokumentů. U každého typu dokumentu je odkaz „Náhled a kontrola“ — ukáže šablonu vyplněnou reálnými údaji, aniž by se cokoliv odeslalo.`,
  },
  {
    slug: "zdravi",
    title: "Zdraví",
    body: `Modul Zdraví eviduje nemoci, úrazy a podávané léky. Sloupec „Léky dnes“ ukazuje, kdo má dnes dostat lék (rozpis na stránce Léky a výdej).

Nový záznam přidáte tlačítkem + Záznam: typ (Nemoc / Úraz…), datum, shrnutí, případně teplota a lék. U úrazu lze přiložit fotku a označit místo na těle. K záznamu lze později přidat Následnou kontrolu.

Na konci akce lze rodičům poslat souhrn zdravotních záznamů tlačítkem „Odeslat souhrny všem rodičům“.`,
  },
  {
    slug: "nastaveni-zdravi",
    title: "Nastavení akce: Zdraví",
    body: `Připravuje číselníky pro modul Zdraví: katalog léků, časy podání (ráno, po obědě…), situace a šablonu souhrnného e-mailu pro rodiče.`,
  },
  {
    slug: "posta",
    title: "Pošta",
    body: `Doručená pošta: tlačítkem „Načíst emaily“ stáhnete nové zprávy. U e-mailu vyberte dítě (aplikace se ho snaží přiřadit automaticky), označte, co uložit (přílohy, stav dokumentů, odpověď), a potvrďte „Provést vybrané akce“. Uložené dokumenty pak vidíte i na stránce Dokumenty.

Hromadný status update (tlačítko „Odeslání pošty“ na Seznamu účastníků) pošle všem rodičům přehled, co máme a co chybí — před odesláním jde zkontrolovat náhled a odznačit příjemce.`,
  },
  {
    slug: "pristup",
    title: "Nastavení akce: Přístup a role",
    body: `Záložka Přístup určuje, který uživatel vidí které moduly u této konkrétní akce (administrátor vidí vždy vše). Nové uživatele přidáváte na úrovni organizace pod Organizace → Uživatelé; tady jen určujete jejich přístup k jednotlivým akcím.`,
  },
];
