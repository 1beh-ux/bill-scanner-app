---
title: Kuchyně
order: 17
---

Modul **Kuchyně** pomáhá naplánovat jídelníček, spočítat množství, ohlídat alergie a nakoupit. Kdo má na akci přístup ke Kuchyni (nebo je správce organizace), vidí a upravuje všechno v modulu – včetně jmen s alergiemi a dietami. Žádné další role uvnitř nejsou.

Zapnutí a přístup: **Nastavení akce → Lidé** (moduly akce a kdo má ke Kuchyni přístup).

## Knihovna jídel

- Jídla a suroviny patří **celé organizaci** – každá akce plánuje ze stejné knihovny.
- Recept se píše na **jednu standardní dospělou porci** (g, ml, ks). Náhled ukáže množství třeba pro 10 porcí.
- **Alergeny jídla** se skládají ze surovin. Surovina, jejíž alergeny nikdo nepotvrdil, je všude **„neověřeno“** – nikdy se nebere jako „bez alergenu“. Potvrzuje se tlačítkem **Potvrdit alergeny** (ideálně podle obalu).
- **Varianty** (např. bezlepková): náhrada suroviny jinou. Jídelníček pak navrhne zvláštní porce pro ty, kdo je potřebují.
- **Vytvořit variantu jídla** udělá kopii receptu. Jídlo, které už bylo v jídelníčku, nejde smazat – jen **archivovat**.
- **Importovat recepty**: nahrajte starý recept (xlsx, docx, pdf, fotka). AI ho přečte a přepočítá na 1 porci, odhady (lžíce, hrnek) a nové suroviny označí. **Nic se neuloží**, dokud recept nezkontrolujete a nekliknete na **Uložit do knihovny**. Alergeny od AI jsou jen návrh – nová surovina je „neověřeno“.

## Jídla dne a věkové skupiny

- **Šablony → Kuchyně** (organizace) a **Nastavení akce → Kuchyně** (akce): jídla dne (snídaně, svačina, oběd, …) s časem a věkové skupiny s porcí vůči dospělému (např. 6–9 let = 0,7).
- Při prvním otevření Kuchyně na akci se zkopírují z organizace (když organizace žádné nemá, vytvoří se výchozí).

## Jídelníček

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
