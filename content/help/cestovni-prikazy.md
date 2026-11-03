---
title: Cestovní příkazy
order: 19
---

Cestovní příkaz proplácí cestu **vlastním autem** (AUV) podle sazeb z vyhlášky. Z odeslaného příkazu vznikne účtenka akce (kategorie **Autoprovoz**, když ji akce nebo šablony organizace mají, jinak **Doprava**) s vygenerovaným PDF – bez AI, částka se počítá z úseků.

Stránka **Účtenky → Cestovní příkazy** (s přístupem k účtenkám akce).

## Sazby podle data, ne podle roku

**Organizace → Sazby cestovních náhrad** (správci organizace). Každá sada platí **od data**: základní náhrada za km, zvýšení za přívěs, ceny pohonných hmot a výchozí spotřeba, když auto nemá údaje z technického průkazu. Cesta použije sadu s nejpozdějším datem „platí od“, které není po začátku cesty. Ceny se v roce mění (v roce 2026 dvakrát), proto sady nejsou po letech.

- **Zkopírovat z předchozí** vytvoří novou sadu se všemi hodnotami nejnovější sady – změníte jen datum a to, co se změnilo.
- Když nějaká akce začíná dřív, než platí první sada, stránka to ukáže nahoře („Pro akci … chybí sazby …“) i s tím, co přidat.
- Výchozí hodnoty pro rok 2026 je potřeba **ověřit podle vyhlášek** (č. 573/2025 Sb. a č. 175/2026 Sb.).
- Tlačítko **Vyhledat aktuální sazby** otevře hledání vyhlášky v Googlu (nová záložka) – hodnoty pak přepište do sady.
- Tamtéž vyplňte adresu, IČO a místo pro „V … dne“ – tisknou se na příkaz.

## Vozidla

**Organizace → Vozidla**: auta řidičů. Majitel je dospělý v Lidech, plátce, nebo (u správce) jen jméno. Spotřeba z TP (až 4 hodnoty, použije se průměr), jinak tabulka ze sazeb podle paliva a převodovky. Auto se nemaže, jen archivuje.

Kdo má přístup k účtenkám akce, vidí auta lidí z akce a může přidat auto dospělému nebo plátci akce; upravit může jen auta, která sám přidal.

## Dospělý a plátce

V **Plátci → Dospělý a kontakt** jde plátce **propojit s dospělým** v Lidech (je to jen odkaz, nic se neslučuje). Výběr pracovníka pak ukáže jednoho člověka a jeho auta. Když mají dospělý a plátce stejné jméno a propojení nejsou, výběr je ukáže jednou a nabídne Propojit.

## Příkaz

Stránka je široká kvůli tabulce úseků. Data a časy se zadávají česky a ve 24hodinovém formátu: dá se psát („23.10.“, „1430“) nebo vybrat z kalendáře / seznamu časů.

**Místa akce** jsou jeden společný seznam pro všechny příkazy akce (přidáte je nad úseky nebo volbou „nové místo…“ přímo v úseku). Odkud a Kam se vybírají z něj. Nový úsek se předvyplní zpáteční cestou (odkud = kam skončil předchozí, kam = odkud vyjel). Po výběru obou míst se km doplní: ze stejné trasy v příkazu, z dřívějších příkazů organizace, jinak **odhadem z mapy** (OpenStreetMap, průměr nalezených tras; posílají se jen názvy míst). Doplněné km jsou zvýrazněné – zkontrolujte je.

Zaškrtnutím jednoho nebo více úseků a **Duplikovat vybrané** se zkopírují za poslední úsek, s datem posunutým za vybraný blok (stejná trasa každý den).

**Šablony cest** (pro celou organizaci): opakované cesty – **Uložit jako šablonu** uloží cestu a úseky (místa, časy, km, částky; data jako „n-tý den cesty“), nikdy pracovníka, auto ani účet. V konceptu **Použít šablonu** úseky doplní s daty od začátku cesty a místa přidá do Míst akce. Smazat ji může ten, kdo ji uložil, nebo správce.

**Zkopírovat pro jiného pracovníka** založí nový koncept se stejnou cestou a úseky – stačí vybrat dalšího řidiče a auto (víc aut na stejné trase).

**Sazby** v panelu výpočtu jsou standardně podle data začátku cesty; jde vybrat i jinou sadu ručně (pak odeslání nekontroluje datum).

Pracovník, vozidlo, cesta (účel, odkud, kam, začátek a konec, schválil, spolucestující, bezplatné jídlo a ubytování – jen se tisknou), úseky (datum, odkud, kam, časy, přívěs, km a volitelně stravné / nocležné / vedlejší výdaje jako ruční částky). Známou vzdálenost mezi dvěma místy z dřívějších příkazů formulář doplní – zkontrolujte ji.

Panel vpravo počítá průběžně: sazba (od kdy platí), spotřeba a odkud je, cena za jednotku a za km, částka každého úseku a celkem (zaokrouhleno nahoru na 0,50 Kč). Bez platné sady ukáže **předběžnou sazbu** – koncept jde uložit, odeslat ne.

Upozornění (neblokují): úsek mimo začátek–konec cesty, úsek nezačíná tam, kde skončil předchozí. Odeslání zablokuje jen: chybějící sazba pro začátek cesty, pracovník, vozidlo, úseky s km a u převodu číslo účtu.

## Co se při odeslání zmrazí

**Odeslat** uloží údaje pracovníka a auta, hodnoty sazby, spotřebu, cenu a všechny částky. Pozdější úpravy sazeb, lidí nebo aut odeslaný příkaz nezmění. **Znovu otevřít** (zapíše se do historie účtenky) vrátí příkaz do konceptu; přepočítá se se stejnou zmrazenou sazbou.

## Změna příjemce

V detailu příkazu (nebo na účtence) jde změnit **příjemce**. Změní se jen komu a na jaký účet se platí, QR kód a PDF – údaje pracovníka a auta zůstanou. Změna je v historii účtenky.

## Co tu není

Půjčená auta (AUP), automatické stravné a nocležné podle zákona, paušální nebo dohodnuté částky, zahraniční cesty, podepsaný sken zpět k účtence.
