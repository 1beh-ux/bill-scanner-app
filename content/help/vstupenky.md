---
title: Vstupenky (veřejná akce)
order: 15
---

**Veřejná akce** je akce s prodejem vstupenek — třeba ples nebo koncert. Nevytváří účastníky, rodiny ani děti: každá objednávka je jen kupující (jméno, e-mail, telefon) a počet vstupenek. Vyberete ji při zakládání akce v **Akce → Typ akce → Veřejná akce (vstupenky)**. Účtenky a Banka fungují jako u každé jiné akce.

## Nastavení (Nastavení akce → Vstupenky)

- **Druhy vstupenek** — název, cena a případně limit kusů (např. Vstupné 300 Kč, limit 250; Student 150 Kč, limit 50). Většinou stačí jeden druh. Cena 0 = vstupenky zdarma, odejdou hned po objednání.
- **Nejvýš vstupenek v jedné objednávce**, **celkový limit** (všechny druhy dohromady), **prodej do** a **místo konání**.
- **Platba** — číslo účtu, kód banky a začátek variabilního symbolu. Každá objednávka dostane vlastní VS (začátek + číslo objednávky, např. 2690001).
- **Automatická kontrola plateb** — u Fio účtu připojeného v Organizace → Připojení se platby kontrolují samy (každých 30 minut a hned, když kupující klikne „Zkontrolovat platbu"). Zaplacená objednávka = vstupenky odejdou e-mailem samy.
- **Rodičovský portál** — zaškrtnutím se vstupenky nabídnou dospělým v portálu s předvyplněným jménem a e-mailem. Objednávka se k osobě nepřipojuje.
- **Odkaz pro kontrolu u vchodu** — tajný odkaz pro pomocníky bez přihlášení. Po akci ho zrušte.
- **E-maily a vstupenka** — text tří automatických e-mailů (po objednání s QR platbou, se vstupenkami, o zrušení) a samotné vstupenky. Vstupenka se píše jako text s nadpisy (`#`, `##`, `**tučně**`) a proměnnými; `{{ticket_qr}}` na samostatném řádku je QR kód pro vstup. **Náhled vstupenky** ukáže PDF s uloženou verzí.
- **Texty na webu** — vlastní znění textů formuláře a potvrzení po objednání (např. „Objednávka č. … je přijatá“, pokyny k platbě). Prázdné pole = výchozí text. Tady jde i vypnout, aby formulář ukazoval, kolik vstupenek zbývá. Chcete-li logo, vlastní písmo a vzhled, vložte do pole **Vstupenka z Google dokumentu** odkaz na Google dokument se stejnými proměnnými (a `{{ticket_qr}}` na místo QR kódu) – každá vstupenka pak vznikne jako jeho kopie. Dokument musí být dostupný účtu, přes který akce pracuje s Google Diskem.

Veřejnou stránku s formulářem (adresa `/r/…`, úvodní text, **Vložit na web** pro vložení na jinou stránku) nastavíte v záložce **Veřejná přihláška**, stejně jako u přihlášek. Pro e-maily musí mít akce připojenou odesílací schránku (Připojení na Google).

## Objednávky (Vstupenky → Objednávky)

Přehled prodaných a zaplacených vstupenek po druzích, počet lidí u vchodu a seznam objednávek s filtrem podle stavu. U objednávky:

- **Zaplaceno** — ruční označení platby (hotovost, jiná banka); vstupenky odejdou hned.
- **Poslat platbu znovu / Poslat vstupenky znovu** — když e-mail nedorazil.
- **PDF** — vstupenky k vytištění nebo předání osobně.
- **Zrušit** — vstupenky přestanou platit (u vchodu se ukáže „Zrušená"), vrátí se do prodeje a kupující dostane e-mail. Peníze případně vraťte ručně v bance.
- **Smazat** — jen u zrušené objednávky a jen pro administrátora: smaže ji natrvalo i se vstupenkami (např. zkušební objednávky). Když smažete ty nejnovější, další objednávky dostanou jejich čísla znovu.

Nezaplacené objednávky zůstávají, dokud je nezrušíte. **Platby k ověření** dole jsou platby na účtu, které kontrola nedokázala přiřadit (jiná částka, neznámý VS, platba podruhé) — zkontrolujte je a objednávku případně označte ručně. **Export (CSV)** stáhne všechny objednávky do tabulky.

## Kontrola u vchodu

**Vstupenky → Kontrola u vchodu** (nebo tajný odkaz) otevře v telefonu kameru: namiřte ji na QR kód vstupenky. Zelená = platná, vstup povolen (vstupenka se označí jako použitá). Oranžová = už použitá (s časem), červená = nezaplacená, zrušená nebo neznámá. Bez kamery jde kód ze vstupenky zadat ručně. Nahoře je vidět, kolik lidí už prošlo. Kontrola potřebuje internet.
