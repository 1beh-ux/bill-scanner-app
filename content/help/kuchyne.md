---
title: Kuchyně
order: 17
---

Modul **Kuchyně** pomáhá naplánovat jídelníček, spočítat množství, ohlídat alergie a nakoupit. Kdo má na akci přístup ke Kuchyni (nebo je správce organizace), vidí a upravuje všechno v modulu – včetně jmen s alergiemi a dietami. Žádné další role uvnitř nejsou.

Zapnutí a přístup: **Nastavení akce → Akce → Moduly akce** a **Nastavení akce → Přístup** (kdo má ke Kuchyni přístup).

## Knihovna jídel

- Jídla a suroviny patří **celé organizaci** – každá akce plánuje ze stejné knihovny.
- Recept se píše na **jednu standardní dospělou porci** (g, ml, ks). Náhled ukáže množství třeba pro 10 porcí.
- **Alergeny jídla** se skládají ze surovin. Surovina, jejíž alergeny nikdo nepotvrdil, je všude **„neověřeno“** – nikdy se nebere jako „bez alergenu“. Potvrzuje se tlačítkem **Potvrdit alergeny** (ideálně podle obalu).
- **Varianty** (např. bezlepková): náhrada suroviny jinou – i suroviny, která ještě není uložená (při importu); nová se založí při uložení jako „neověřeno“. Jídelníček pak navrhne zvláštní porce pro ty, kdo je potřebují.
- **Vždy v kuchyni** (sůl, koření…): u suroviny zaškrtnete a v receptu nemusí mít množství („dle potřeby“). V nákupu je zvlášť, jen ke kontrole zásob.
- **Počítat také v**: druhá jednotka suroviny – česnek v kusech jako „stroužek“, mouka „hrnek = 140 g“. V receptu pak jde množství zadat v ní a v jídelníčku, nákupu i listu pro kuchaře se ukáže vedle.
- **Vytvořit variantu jídla** udělá kopii receptu. Jídlo, které už bylo v jídelníčku, nejde smazat – jen **archivovat**.
- **Importovat recepty**: nahrajte starý recept (xlsx, docx, pdf, fotka). AI ho přečte a přepočítá na 1 porci, odhady (lžíce, hrnek) a nové suroviny označí. **Nic se neuloží**, dokud recept nezkontrolujete a nekliknete na **Uložit do knihovny**. Alergeny od AI jsou jen návrh – nová surovina je „neověřeno“. AI navrhne i druh jídla, časy, nádobí, štítky, varianty (např. bezlepková s náhradami), u nových surovin obsah (maso, mléčné…) a co je „vždy v kuchyni“; neznámou jednotku (plechovka, balení) počítá v kusech a nabídne ji jako druhou jednotku. Jeden import stojí zhruba 0,4 Kč (AI Gemini).

## Diety

**Šablony → Kuchyně → Diety**: seznam diet organizace (výchozí vegetarián, vegan, bez vepřového, bezlepková, bez laktózy), lze přidat vlastní (např. bez ořechů). U každé diety: slova, podle kterých se pozná v textu rodičů, a co ji porušuje – obsah suroviny nebo alergeny. Surovina může být **vhodná i pro** dietu (bezlaktózové mléko pro „bez laktózy“). Laktóza se čte jako dieta „bez laktózy“, ne jako alergie na mléko.

## Jídla dne a věkové skupiny

- **Šablony → Kuchyně** (organizace) a **Nastavení akce → Kuchyně** (akce): jídla dne (snídaně, svačina, oběd, …) s časem a věkové skupiny s porcí vůči dospělému (např. 6–9 let = 0,7).
- Při prvním otevření Kuchyně na akci se zkopírují z organizace (když organizace žádné nemá, vytvoří se výchozí).

## Jídelníček

![Jídelníček](/napoveda/images/kuchyne-jidelnicek-1.jpg)

- Mřížka dny × jídla dne. Jídlo se **přetáhne z knihovny** do políčka, mezi políčky se dá přesouvat.
- **Strávníci** = aktivní účastníci (volitelně jen přijatí) + dospělí na akci, kteří tu jedí, v jejich termínu, minus nepřítomní, plus **úpravy počtu** (hosté, výlet bez oběda). Porce = součet podle věku k datu jídla; kdo nemá datum narození, počítá se jako 1,0 a jídelníček to řekne.
- **Velikost porcí**: z hodnocení „Jak to dopadlo“ se učí násobek pro každé jídlo. Je to **jen návrh** s důkazem („× 0,94, 3 hodnocení ze 2 akcí“) – do jídelníčku se dostane, až když kliknete **Použít**.
- **Alergie**: u každého jídla semafor. Červená = někdo nemá bezpečné jídlo (žádná varianta, nebo varianta není zapnutá). Žlutá = něco je neověřené. Je to pomůcka – rozhoduje vždy člověk.
- **Potvrdit den** zafixuje recepty a množství; pozdější úpravy knihovny je nezmění. **Znovu otevřít** vrátí den do návrhu.
- **Kopírovat z minulé akce**: den 1 → den 1, jako návrh.
- **Cena na osobu a den**: útraty za potraviny (vybrané kategorie účtenek v nastavení) / osobodny. Žádné ceny surovin se nevedou.

## Strava účastníků

Co rodiče napsali do alergií a co z toho aplikace vyčetla (např. „ořechy, lepek“ → 8, 1). Každý návrh **potvrdí člověk**. Když rodič text později změní, objeví se „změněno po potvrzení“. Dospělí se upravují v Lidech.

## Kuchyně dnes a nákup

- **Kuchyně dnes** (na telefon): dnešní jídla s porcemi, množstvími, zvláštními porcemi se jmény, postupem a poznámkami; jde vytisknout. Po výdeji se odemkne **Jak to dopadlo** (Chybělo / Akorát / Zbylo). Poslední načtený den zůstane v telefonu i bez signálu.
- **Nákup**: suroviny na každý den podle jídelníčku, seskupené podle „kde koupit“, s odškrtáváním, CSV a tiskem.
