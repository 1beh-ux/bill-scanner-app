---
title: Nastavení akce — Připojení na Google (Disk a schránka)
order: 5
---

Aby akce mohla importovat účtenky a odesílat e-maily, musí mít připojený Google účet k Disku a schránku pro odesílání. Najdete v Nastavení akce → Připojení na Google.

![Nastavení akce — Připojení: Disk a schránka](/napoveda/images/pripojeni-1.jpg)

- **Účet pro Drive této akce** — účet, který má přístup ke složce s účtenkami; musí mít roli Editor ke složce pro import i export.
- **ID složky pro import účtenek** / **ID složky pro export** / **složka pro Účastníky a Poštu** — ID najdete v adrese složky na Disku, za `/folders/` (můžete vložit i celou adresu). Pod každou vyplněnou složkou je odkaz **Otevřít složku na Disku**, tlačítko Otestovat připojení ověří, že aplikace má do složky přístup.
- **Složka pro Účastníky a Poštu** — sem jdou dokumenty po dětech (každé dítě má podsložku). Prázdná = použije se složka pro export účtenek.
- **Každý export má svou složku** (sekce Export): účtenky (soubory), přehled účtenek (manifest), zdravotní PDF souhrny pro rodiče, seznam účastníků (tabulka), program a vstupenky. Prázdná složka = použije se složka účtenek, takže dokud nic nevyplníte, jde všechno tam jako dřív. Import účtenek se nemění.
- **Odesílatel e-mailů** — schránka Google Workspace, ze které chodí souhrny a potvrzení rodičům. Vlastník schránky musí jednorázově povolit přístup tlačítkem + Připojit novou schránku.

**Bez těchto dvou připojení akce nefunguje** — proto je obojí součástí checklistu „Akce je připravena" na začátku Nastavení akce.

**Složka Zpracované soubory** — když ji vyplníte, import z Disku po načtení přesune naimportované soubory (i ty, které už v akci byly) ze složky pro import sem, takže ve složce pro import zůstane jen to, co se ještě nenačetlo nebo skončilo chybou. Účet aplikace potřebuje právo zápisu do obou složek. Je to i výchozí cílová složka nástroje Úklid Disku.
