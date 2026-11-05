---
title: Nastavení akce — Přístup a role
order: 12
---

Záložka Přístup určuje, který uživatel vidí které moduly u této konkrétní akce.

![Nastavení akce — Přístup uživatelů](/napoveda/images/pristup-1.jpg)

- Administrátor má přístup ke všemu vždy (šedý text „administrátor — vždy má přístup").
- U ostatních uživatelů (např. hlavní vedoucí konkrétního tábora) zatrhněte, které moduly (Účtenky, Účastníci, Zdraví, Pošta, Plánování, Banka) pro tuto akci mají vidět.
- **Účastníci** je samostatný modul: seznam účastníků, dokumenty, odesílání e-mailů a jejich nastavení. Zapnete ho i bez Zdraví a Pošty (třeba pro akci jen s přihláškami). Kdo má Zdraví nebo Poštu, vidí účastníky dál i bez něj — pracují se stejnými dětmi.
- Nové uživatele (e-mailové účty) přidáváte na úrovni celé organizace pod Organizace → Uživatelé; tady jen určujete jejich přístup k jednotlivým akcím.

## Kdo co může

Přístup k modulu znamená **práci v něm**, ne správu akce. Akci samotnou spravuje správce organizace.

| Co | Správce organizace | Uživatel s přístupem k Účtenkám | Uživatel s Účastníky / Vstupenkami |
|---|---|---|---|
| Název, data, druh a místo akce | ano | ne | ne |
| Uzavřít / znovu otevřít akci | ano | ne | ne |
| Moduly akce a přístupy uživatelů | ano | ne | ne |
| Připojení Disku (účet, složky, převzít) | ano | jen vidí, co je připojeno | jen vidí |
| Otestovat Disk, export účtenek na Disk | ano | ano | ne |
| Registrace, portál, ceny, platební účet, VS, kontrola plateb | ano | ne | ne |
| Veřejná přihláška (stránka, adresa, texty) | ano | ne | ano |
| Účtenky: nahrávání, kontrola, schválení, sloupce seznamu, QR | ano | ano | ne |
| Sloupce seznamu účastníků | ano | ano | ano |
| Banka (párování plateb) | jen s výslovným přístupem | jen s přístupem k Bance | jen s přístupem k Bance |
| Organizace → Lidé, Uživatelé, Šablony, Připojení, Sazby, Vozidla | ano | ne | ne |

Kde uživatel bez práv správce něco upravit nemůže, aplikace ukáže „Tohle upravuje správce organizace.“

Přístup se řídí Google účtem — uživatel se přihlásí svým Google účtem a vidí jen to, co mu tady bylo povoleno.

Aplikace zaznamenává, které stránky přihlášení uživatelé otevírají, kvůli provozu a zlepšování aplikace; záznamy se uchovávají 12 měsíců.
