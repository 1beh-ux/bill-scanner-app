---
title: Účtenky
order: 2
---

V menu Účtenky je seznam všech účtenek akce se stavy (Nové, Schváleno…) a filtry Proplaceno/Neproplaceno.

Které filtry (štítky nad seznamem) se ukazují a v jakém pořadí, nastavíte tlačítkem **Filtry** vedle tlačítka Sloupce — platí pro celou akci. Kliknutím na název sloupce seznam řadíte (A→Z, Z→A, zpět), ikonou vedle názvu filtrujete hodnoty jako v Excelu.

![Seznam účtenek](/napoveda/images/uctenky-1.jpg)

1. Kliknete na **Nahrát účtenky** a vyberete způsob: nahrát soubor, vyfotit, import z Google Drive nebo z tabulky.

![Import účtenek](/napoveda/images/uctenky-2.jpg)

2. AI účtenku přečte a předvyplní obchod, datum, částku a kategorii. Zkontrolujte údaje vpravo a případně účtenku rozdělte do více kategorií — součet musí odpovídat celkové částce.

![Účtenka rozdělená do dvou kategorií](/napoveda/images/uctenky-3.jpg)

3. Vyberte **Plátce** (kdo účtenku zaplatil) a stav platby. Pokud platí účastník/dobrovolník (ne akce přímo), zobrazí se pole **Stav platby**: Proplaceno / Neproplaceno — podle něj vidíte, komu ještě organizace dluží peníze.

![Účtenka s plátcem a stavem platby](/napoveda/images/uctenky-4.jpg)

4. Tlačítkem **Schválit** (nahoře u názvu souboru) účtenku potvrdíte — schválené účtenky se již nepřepočítávají při změně kurzu a jsou připravené k exportu pro účetní (Nastavení akce → Připojení → Exportovat do Drive).

Vícestránkové PDF zůstane při importu vcelku (jedna účtenka). Pokud je v něm víc účtenek, klikněte v tabulce importu na **Stránky (N)**: zobrazí se náhledy všech stran, ✂ mezi stranami určuje, kde začíná další účtenka, stránky jde přetáhnout jinam nebo vynechat (prázdné jsou vynechané předem). Rychlá volba **Po 1 / Po 2 … str.** rozdělí soubor pravidelně.

Když se účtenky rozdělily omylem, vyberte je v seznamu účtenek a dejte **Sloučit do jedné** — stránky se seřadí podle názvu souboru (strana 1, 2, …). Pokud je už přečetla AI, sloučenou přečte znovu. Nejde to u schválených, proplacených a se spárovanou bankovní platbou.

## Synchronizace s Diskem

**Synchronizovat s Diskem** nahraje schválené účtenky, které na Disku ještě nejsou, a přepíše manifest. Běží vždy jen jedna synchronizace akce — když už běží (třeba z jiného okna nebo před obnovením stránky), tlačítko je vypnuté s textem „Export na Disk právě běží…“ a stránka se sama obnoví, až doběhne. Velký export se nahrává po částech a stránka pokračuje sama („Nahráno X, zbývá Y“).

## Úklid souborů na Disku

V menu **Úklid Disku** zadáte jednu nebo více složek na Disku (i s podsložkami). Aplikace u každého souboru zjistí, jestli ho používá účtenka — podle obsahu souboru, takže nezáleží na jménu — a ukáže, ve které akci, v jakém stavu je a jestli je proplacená. Soubory se stejným obsahem označí jako duplicity: ponechá kopii, kterou používá účtenka, ostatní navrhne smazat. Soubory se stejným jménem ve stejné složce (např. dvakrát nahraný export) označí také: ponechá nejstarší, ostatní navrhne smazat (soubor, který účtenka používá podle obsahu, nikdy). Zadané složky si aplikace pro každou akci pamatuje. Vybrané soubory pak přesunete do uklizené složky (odkazy na ně zůstanou funkční) nebo kopie do koše na Disku, odkud jdou 30 dní obnovit.

U každé účtenky je pod náhledem **Zdroj**: import z Disku (s odkazem na původní soubor), nahráno, vyfoceno nebo vytvořeno z platby v bance.

## Ruční zadání a výměna souboru

- **Ruční zadání** (nahoře v seznamu účtenek): účtenka zadaná ručně – odhad nebo účtenka, jejíž doklad ještě nemáte. Datum, obchod, částka, kdo platil (nebo Akce) a kategorie. Počítá se do rozpočtu a součtů jako každá jiná a je označená **chybí doklad**; až doklad přijde, nahrajte ho v detailu účtenky (**Nahrát doklad** – AI ho přečte).
- **Nahradit soubor** (v detailu účtenky pod dokladem): lepší sken nebo stažené PDF místo původního souboru. Údaje účtenky zůstanou; zaškrtnutím „a nechat ho přečíst AI“ je AI přečte znovu. Schválenou účtenku nejdřív znovu otevřete.
