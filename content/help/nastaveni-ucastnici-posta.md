---
title: Nastavení akce — Účastníci a Pošta
order: 8
---

### Záložka Účastníci — pole

Zde se definuje, jaká pole se u účastníka sledují (jméno, adresa, alergie, členství…) a kde se mají zobrazovat.

![Nastavení akce — pole účastníků](/napoveda/images/nastaveni-ucastnici-posta-1.jpg)

- **Kategorie**: vestavěná (jméno, datum narození – nelze smazat), vlastní (přidaná vámi) nebo zákonný zástupce.
- **Zobrazit ve sloupcích** určuje, kde se pole objeví (Seznam účastníků, Zdraví, Pošta…).
- Každé pole má svůj variabilní název v e-mailech a dokumentech, např. `{{adresa}}`, `{{allergies}}`.

### Záložka Pošta — typy dokumentů a e-mailové šablony

Zde se spravují typy dokumentů (Přihláška, Zdravotní posudek) propojené s jejich Google Doc šablonou a šablona hromadného e-mailu o stavu dokumentů.

![Nastavení akce — Pošta: typy dokumentů a šablona e-mailu](/napoveda/images/nastaveni-ucastnici-posta-2.jpg)

- U každého typu dokumentu je odkaz **Náhled a kontrola** — ukáže šablonu vyplněnou údaji konkrétního účastníka, aniž by se cokoliv odeslalo.
- Text e-mailu používá stejnou paletu proměnných jako dokumenty (např. `{{document_checklist}}`) a má živý náhled dole na stránce.
