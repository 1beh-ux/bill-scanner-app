---
title: Osobní účtenky
order: 18
---

Nákupy pro lidi, které **nejsou výdajem akce** – zmrzlina, suvenýry, věci, které si někdo nechal koupit. Nejsou v oficiálních účtenkách, v exportu do účetnictví, v rozpočtu ani ve vyúčtování s organizací.

Stránka **Účtenky → Osobní účtenky** (s přístupem k účtenkám akce).

## Pokladník a autor

Nahoře nastavte **pokladníka akce** – předvyplní se jako autor každé nové osobní účtenky. U každé účtenky jde autora změnit:

- **Člověk + Vyúčtovat přes akci** (výchozí): akce mu proplatí díly ostatních (s jeho proplacením) a ostatní zaplatí svůj díl akci (započte se s jejich proplacením). Příklad: Jakub koupil zmrzlinu za 300 Kč pro sebe, Janu a Petra → Jakubovi akce vrátí 200 Kč, Janě i Petrovi se 100 Kč odečte z jejich proplacení.
- **Člověk bez „přes akci“**: vyřeší si to sám – lidé mu zaplatí napřímo (Platby → Osobní dluhy mezi lidmi).
- **Akce (peníze akce / pokladna)**: zaplaceno z peněz akce – lidé zaplatí svůj díl akci, nikomu se nic nevrací.

## Nová osobní účtenka

- **Ručně**: datum, obchod, částka (Kč, EUR nebo PLN – přepočte se kurzem ČNB), kdo zaplatil.
- **Nahrát fotku** je nepovinné: AI předvyplní obchod, datum a částku.
- S fotkou je formulář ve dvou sloupcích: vlevo účtenka a položky, které přečetla AI, vpravo rozdělení.
- **Rozdělit mezi**: **rovným dílem** – zaškrtněte lidi (plátci akce a dospělí na akci), rozdělí se na haléře přesně; **podle částek** – u každého je rovnou políčko (0 = nic) a aplikace hlídá, kolik ještě zbývá; **podle položek** – každý řádek účtenky (přečtený AI nebo dopsaný ručně) přiřadíte jednomu či více lidem („+ všichni“ pro společné věci), řádek pro více lidí se dělí rovným dílem.
- **Zbytek přiřadit**: u „podle částek“ a „podle položek“ jedním klikem dáte vše, co zbývá, jednomu člověku – typicky sobě („200 Kč rozdělím, zbytek je můj“). Díl autora se nikomu nevrací ani neodečítá. Dokud se části nesečtou, je účtenka červeně „nerozděleno“ a počítá se jen to, co je rozdělené.
- Vybraný dospělý, který ještě není plátce, se plátcem stane (propojený s Lidmi) – aby mu šel poslat i přijmout QR kód.
- **Přesunout do osobních** (u oficiální účtenky) a **Přesunout do oficiálních** (u osobní) přesouvají účtenky mezi oběma světy.

## Čárky (pivo, limonáda…)

**Ceník čárek** drží položky se základní cenou za kus (pro celou organizaci). **Čárky** = jedna „účtenka“ třeba za sud: vyberete položku (cenu jde změnit), autora a u každého zadáte, kolik měl – políčkem, tlačítky +1 / +2 / +3, nebo **Průvodcem po jednom** (jméno po jménu, velká tlačítka +1, +2, +3, +5, +10). Každému vznikne dluh počet × cena.

## Platby – započtení

U každého člověka: kolik mu akce dluží za oficiální účtenky **plus** co zaplatil za ostatní (přes akci) **minus** jeho vlastní osobní útraty přes akci. Příklad: zaplatil za akci 200 Kč, zmrzlina pro něj stála 100 Kč → **jeden QR kód na 100 Kč** na jeho účet. Když dluží víc, než mu akce vrací, QR kód je naopak **na účet akce** (účet v Bance, jinak pokladníka).

**Zaplaceno** označí proplacené účtenky i osobní díly najednou. Účtenky vyúčtované mimo akci jsou dole v **Osobní dluhy mezi lidmi** – s QR kódem na účet toho, kdo platil, a tlačítkem **Vyrovnáno**.

Vyrovnanou osobní účtenku už nejde upravit ani smazat – nejdřív vraťte „Zaplaceno“ na stránce Platby.

## Vyúčtování – odkaz pro každého

Na stránce **Platby** má každý člověk **jeden odkaz na akci** (`tabornik.online/vyuctovani/<akce>/…`, bez přihlášení). Na něm vidí, co přesně se mu započítalo: účtenky, které za akci zaplatil, své osobní útraty (i s položkami, které mu byly přiřazené, a čárkami), co zaplatil za ostatní, a výsledek.

- **Akce vám pošle X Kč**: vidí, na jaký účet; může ho zadat nebo opravit (na Platbách se pak ukáže „účet nedávno změněn“). Až peníze odešlete (Zaplaceno), může potvrdit **Peníze jsem dostal(a)**.
- **Zaplaťte akci X Kč**: QR platba, účet a částka ke zkopírování, tlačítko **Zaplatil(a) jsem** (jen jeho tvrzení, jde vrátit). Vyrovnáno je, až to potvrdíte (Zaplaceno) nebo banka.
- **Mezi lidmi**: komu dluží (QR na účet toho člověka) a kdo dluží jemu – tam potvrdí **Od … jsem peníze dostal(a)**.

**Kam lidé platí** (nahoře na Platbách): na **účet pokladníka** (výchozí) nebo na **účet akce v Bance**. Když má pokladník zadaný svůj **Fio token** (jen pro čtení), platba s variabilním symbolem odkazu a aspoň plnou částkou se potvrdí sama; nedoplatek nikdy. Bez Fio se variabilní symbol neukazuje a platbu potvrdíte ručně. Fio dovolí jedno volání za 30 s na token – odkazy se kontrolují nejvýš tak často (a v pozadí každých 10 minut).

**Odkazy pro všechny** vytvoří odkazy všem a vypíše je ke zkopírování (např. do skupinového chatu). **Nový odkaz** starý zruší.
