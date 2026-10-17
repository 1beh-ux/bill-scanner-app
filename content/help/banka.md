---
title: Banka
order: 14
---

Modul **Banka** porovná pohyby na bankovním účtu akce s účtenkami: co bylo zaplaceno z účtu, k čemu chybí doklad a kolik se vybralo v hotovosti. Vidí ho jen ten, komu ho správce v **Nastavení akce → Lidé** výslovně přidělí — i správce organizace si ho musí zapnout sám, protože jsou tu i soukromé platby.

## Účty a import

V **Banka → Účty a import** připojíte účet a nastavíte období (výchozí jsou data akce). Pohyby mimo období se nenačtou.

- **Fio API** — vložte token (Fio internetové bankovnictví → Nastavení → API, typ „Pouze sledovat účet"). Token se uloží šifrovaně a už se nikdy nezobrazí. **Otestovat připojení** načte jeden den, **Synchronizovat** celé období; aktivní akce se synchronizují i samy jednou denně. Fio dovoluje jeden dotaz za 30 sekund. Data starší 90 dní Fio vydá jen po odemčení historie v internetovém bankovnictví (Nastavení → API → ikona zámku), pak 10 minut.
- **Google Tabulka** — stejně jako u účastníků: tabulku nasdílejte účtu aplikace, vložte odkaz, zkontrolujte sloupce. Mapování se zapamatuje, **Synchronizovat** tabulku načte znovu. Řádek, který z tabulky zmizel, se jen označí ⚠, nikdy se nesmaže.
- **Soubor** (CSV z banky) a **Vložit** (zkopírovaná tabulka) — aplikace pozná kódování i řádek se záhlavím; když ne, vyberete ho sami.

Před importem vidíte náhled: **Nové / Duplicita / Mimo období / Chyba** (s důvodem). Opakovaný import stejného souboru nic nezdvojí.

## Klasifikace

Každý pohyb má klasifikaci:

- **Výdaj** — platba za něco pro akci; má mít doklad a nabízí se k párování s účtenkami.
- **Příjem** (poplatek účastníka, dotace, dar, vratka, jiný) — peníze, které akce dostala.
- **Pokladna** — výběr hotovosti; doklady jsou pak u jednotlivých nákupů za hotové.
- **Poplatek** — poplatek bance, výdaj bez dokladu.
- **Vlastní převod – vyloučit** — mezi vlastními účty organizace; nepočítá se do příjmů ani výdajů.
- **Soukromé – vyloučit** — platba, která s akcí nesouvisí; můžete určit osobu, která ji má vrátit.
- **Jiná akce – vyloučit** — patří jiné akci; přes **Přesunout do** ji předáte.

Vysvětlení najdete i přímo v Pohybech pod „Co znamenají kategorie pohybů?“.

**Pozor na znaménko:** příjem a výdaj v součtech se řídí znaménkem částky (plus = příchozí, minus = odchozí), ne kategorií. Když import načetl výdaj jako kladnou částku, u řádku se ukáže „⚠ částka je kladná – otočit na výdaj“; jedním kliknutím znaménko otočíte a pohyb se začne nabízet k párování. Ostatní údaje (datum, částku, protistranu, VS, zprávu) opravíte tužkou ✎ vedle data. Spárovaný pohyb nejde měnit v částce ani datu — nejdřív ho odpárujte. Opakovaný import vaše opravy nepřepíše.

V Pohybech fungují nad sloupci filtry a řazení jako v seznamu účtenek (kliknutím na název sloupce řadíte, ikonou filtru vybíráte hodnoty). Výběr osoby nabízí jen plátce této akce. Při importu se nastaví sama (bankomat → Pokladna, vlastní účet → Převod, poplatek → Poplatek, VS účastníka → Příjem/poplatek), vaši ruční změnu už žádný import nepřepíše.

V **Pohybech** stačí klávesy: ↑/↓ řádek, **S** soukromé, **P** pokladna, **T** převod, **F** poplatek, **V** výdaj, **Enter** otevře párování.

## Párování

Aplikace páruje platby s účtenkami podle **částky a data** (obchod, VS a text zprávy jen rozhodují mezi stejnými kandidáty). **Nikdy nic nespáruje sama** — jen navrhne: **Jistý** návrh (jediná shoda na obou stranách) a **Možný** návrh. Návrh se nikde nepočítá, dokud ho nepotvrdíte (✓ u řádku, **Potvrdit návrhy**, **Potvrdit všechny jisté**). Zamítnutý návrh se už znovu nenabídne.

V **Párování** vlevo vyberete platbu, vpravo zaškrtnete účtenky (i z jiné akce — **Přesunout sem**) a **Spárovat** (Enter). Když se součet liší, vyberete důvod (kurzový rozdíl, poplatek, zaokrouhlení, částečná platba). Platba plátci (proplacení) má jeho neproplacené účtenky předem zaškrtnuté a po spárování je označí jako **Proplaceno**.

Vlevo si platby můžete filtrovat (k párování / spárované / všechny výdaje, hledání, datum, částka). Vpravo jsou jen účtenky, které ještě nejsou zaplacené; zaškrtnutím **i zaplacené** uvidíte i spárované a označené Hotově / Jiný účet — s tím, jak jsou zaplacené, a křížkem pro odpárování. Když tak spárujete účtenku vedenou jako Hotově, aplikace se zeptá a změní ji na Banka. U **schválené** (zamčené) účtenky se aplikace před každou změnou platby zeptá, jestli ji opravdu chcete měnit.

## Vytvořit doklad / Najít doklad

K platbě bez účtenky vytvoříte doklad (**Vytvořit doklady**): datum, částka a obchod se převezmou z platby, je hned spárovaný a označený **chybí doklad**. Poplatky apod. označíte **Doklad = bankovní výpis**. U dokladu bez souboru pak soubor přetáhnete nebo nahrajete (AI ho přečte, párování zůstane), nebo použijete **Najít doklad**: stejná částka v jiné akci, soubory ve složce pro import na Disku, případně doklad přiřadíte osobě.

## Sloupec Platba v Účtenkách

Když má akce Banku zapnutou, vidí všichni s Účtenkami sloupec **Platba**: **Banka** (spárováno celou částkou), **Částečně**, **Hotově**, **Jiný účet**, **Návrh** (čeká na potvrzení), **Nespárováno**. Hotově / Jiný účet nastavíte ručně (i hromadně). Údaje o platbách (protistrana, zpráva) zůstávají jen v Bance.

## Cizí měna (polské účty, platby kartou v zahraničí)

Účet má svou měnu (při přidání účtu vyberete, Fio ji zjistí samo) a pohyby se ukazují v ní — polský účet v PLN. Platba kartou v cizině z korunového účtu ukazuje i původní částku („původně 95,00 PLN“).

Párování porovnává v měně platby: platbu 95 PLN s účtenkou na 95 PLN, korunovou platbu kartou podle její původní částky. Účtenka má vedle své měny i částku v Kč podle kurzu ČNB (ten používá celá aplikace — rozpočty, export) a ta se nemění; kurz banky je vidět jen na platbě. Rozdíl mezi nimi je „kurzový rozdíl“ a při párování se doplní sám. Součty v Pohybech a v Přehledu jsou po měnách — koruny a zloté se nesčítají.
