# Travel orders (Cestovní příkazy) — design for the Bills module

Nov 3, 2026 · @Pavel

Travel orders become a new document type in Bills, driven by a yearly, date-versioned rate set and a small registry of people and cars. This design is based on two filled-in Podzimky 2026 workbooks (Pavel and Kuba) and the existing Bills, Lidé and Plátci models.

## Source files and what the template does

Both workbooks are the same Czech travel-order template for private car use. Only the "Vstupní data" sheet is input. "Cestovní příkaz" is the printable order and "Vyúčtování pracovní cesty" is the settlement.

The calculation, replicated exactly:

- Fuel cost per km = average consumption × fuel price ÷ 100.
- Each leg = km × (fuel cost per km + base rate per km). With a trailer, the base rate gets +15 %. The leg is rounded to 0.1 Kč.
- The order total is the sum of legs, rounded up to the nearest 0.5 Kč.
- Average consumption is the mean of the technical-certificate (TP) values entered. If none are entered, a table by fuel and gearbox is used.
- A receipt price per litre can override the standard fuel price.

My replication reproduces both totals in the files: 3 312.5 Kč (Pavel, 388 km) and 2 397.5 Kč (Kuba, 330 km).

## Finding: fuel prices in both files are outdated for the trip date

Both files use the January 2026 decree values (diesel 34.10, Natural 95 34.70 Kč/l), but the rates changed twice during 2026. Diesel rose to 44.50 Kč/l from 1 June 2026 ([Finance.cz](https://www.finance.cz/aktuality/nafta-pro-cestovni-nahrady-vzrostla-na-44-50-kc-za-litr-spocitejte-si-vysi-nahrady-v-kalkulacce/)). Natural 95 rose from 34.70 to 41.80 Kč/l from 1 October 2026 ([Měšec.cz](https://www.mesec.cz/clanky/natural-95-za-41-80-kc-premiovy-benzin-jen-za-39-kc-cestovni-nahrady-prinesly-paradox/)). Natural 98 stays at 39 Kč and electricity at 7.20 Kč/kWh. The base rate for cars is 5.90 Kč/km, plus at least 15 % with a trailer ([Pohoda](https://portal.pohoda.cz/dane-ucetnictvi-mzdy/mzdy-a-prace/cestovni-nahrady-v-roce-2026/)).

The trip ran 27 Oct to 1 Nov 2026, so the new prices apply. This assumes the organization follows the decree rates, which the file's "Nastavené normy" block suggests.

| Person | Total in the file | Total with rates valid on the trip date |
| --- | --- | --- |
| Pavel (Natural 95, 7.6 l/100 km) | 3 312.5 Kč | 3 522.0 Kč |
| Kuba (diesel, TP 4.0 l/100 km) | 2 397.5 Kč | 2 534.5 Kč |

This is why rates must be keyed by valid-from date, not by year.

## Differences between the two persons

The two files differ in vehicle, consumption source, route and number of legs. Organization, IČO, the 5.90 Kč/km rate, dates, purpose and cash payout are identical.

|  | Pavel | Kuba |
| --- | --- | --- |
| Vehicle | Kia Ceed, 1396 cm³, automatic, Natural 95 | Škoda Octavia, 1598 cm³, manual, diesel |
| Consumption | No TP value, table fallback 7.6 l/100 km | TP value 4.0 l/100 km entered |
| Fuel cost per km (file prices) | 2.64 Kč | 1.36 Kč |
| Route | Praha-Kobylisy to Hluboká-Březiny, 152 km one way | Praha-Hůrka to Hluboká u Skutče, 165 km one way |
| Legs | 8, including shuttles to Skuteč, Litomyšl and Hrad | 2, there and back |
| Phone stored as | Text | Number (formatting lost) |

Pavel's file also has a scratch sheet with a rough estimate (km × consumption × flat 40 Kč, rounded up). Kuba's file has per-driver amounts next to the co-travellers field (Dodávka 2 000, Pavel 1 200, and so on). I read both as informal planning notes, not part of the official form.

## What becomes a variable

Everything the template hardcodes or retypes per person moves into one of six tiers.

| Tier | Values | Notes |
| --- | --- | --- |
| 1. Rate set (organization level, versioned by valid-from date) | Base rate per km (5.90); trailer surcharge (15 %); fuel prices for diesel, Natural 95, Natural 98 and electricity; default consumption table by fuel and gearbox; rounding rules (0.1 Kč per leg, 0.5 Kč on total) | The consumption table (6.9 / 7.6 benzin, 5.8 / 6.4 diesel) has no stated source in the file. Please confirm where it comes from. Meal-allowance (stravné) rates by trip duration can be added later; the template does not compute them. |
| 2. Organization | Name, address, IČO, city for "V Praze dne", declaration text, default payout method, approver's role | Hardcoded or retyped in the template today. |
| 3. Event | Default purpose (event name), default destination, event dates, library of known distances | Examples from the files: Hluboká-Skuteč 12 km, Hluboká-Litomyšl 24 km, Hluboká-Hrad 6 km. Shuttle legs repeat for everyone, so they are entered once. |
| 4. Vehicle | Model, cm³, plate, gearbox, fuel type, TP consumption values 1-4 (nullable) | Lives in the registry, not in each order. |
| 5. Person | Home address, phone (normalized to +420 format), payout account, home-to-camp km per destination | Linked to Lidé and Plátci, see the registry section. |
| 6. Order | Legs, trailer flag, receipt price override, free meals and lodging flags, co-travellers, approval date, approver | Snapshot at creation, see the multi-year section. |

## How multiple years affect the design

Rate sets are chosen by date, orders freeze a snapshot, and people and cars persist across years.

- **Rate sets by valid-from date, not year.** The June and October 2026 changes prove it. By default one rate set applies per order, chosen by the trip start date, because the paper form has a single fuel price. A trip spanning New Year is an edge case to decide.
- **Orders freeze a snapshot.** The order stores the rate-set ID, the consumption used, the price per km and all computed amounts, plus snapshots of person and vehicle data. Editing 2027 rates or a person's address never changes a 2026 order. This is the same principle already used for ČNB exchange rates on bills.
- **Yearly maintenance.** An organization admin copies the last rate set and edits it, and sees a warning when an event date has no valid rate set. Without one, drafts are allowed with the latest rate marked "preliminary", but approval is blocked with a message saying exactly what to set.
- **Vehicles and people persist.** Next year the driver just picks the car. Vehicles get an archive flag instead of deletion.
- **Yearly report per driver** for the accountant comes almost free once orders exist.

## People and cars database

A new organization-level `Vehicle` table links to existing people records; no new people table is created.

- **`Vehicle`:** the fields from tier 4 plus an owner link and an archive flag.
- **Owner link:** either the adult in Lidé (`isAdult`) or the payer (Plátce), both optional. Lidé holds the address and the payer holds the bank account.
- **Soft payer-adult link** (`Author.childId?`): one human is one payer plus one adult. This slightly bends the earlier rule that payers and participants are never merged. That rule was about parents versus children, so a soft link between a payer and an adult leader fits its intent, but it is your decision.
- **"Pracovník" picker** when creating an order: it searches the event's adults and payers together, de-duplicates by name, and offers "propojit" when it finds the same person in both.
- **Missing field:** phone is stored in neither place today, so it is added as a nullable field.
- **Privacy:** plates, addresses and bank accounts are personal data. Default proposal: org admins edit everything; event users see and add only people in their event, as with payers today.

## Where it fits in Bills

A travel order is a Bills document with a 1:1 `TravelOrder` detail record. It appears in the bills list (payee = driver, category "Doprava"), skips the AI pipeline, and generates the printable PDF.

Approval, Drive export, payment QR and bank reconciliation (the rare n:1 reimbursement case) then work with no extra build. A fuel receipt can link to an existing bill.

The worker and car are separate from the payee. The order keeps the worker and vehicle details as set (name, address, phone, plate, consumption). The Bills payee can later be changed to another person, for example when someone else should receive the money. That change updates only the payee name, payout account and payment QR; the printed order keeps the worker and car unchanged, and the change is written to the bill audit log.

Claude Code should first check how Bill statuses and the AI pipeline handle a document that is not scanned.

## Template issues to fix in the app

- **Vehicle kind is ignored.** The "vehicle used" column (AUV own car, AUP rental) is never used in the formula, so a rental leg would be paid like an own car. Decision needed: either block AUP or pay fuel receipts only.
- **Manual columns.** Stravné, lodging and incidental columns are manual and not computed by rule. Keep them optional in the MVP.
- **Leg times are not validated against the order window.** Kuba's leg departs at 14:00, before the stated 15:00 start, and Pavel's leg departs at 18:00. The app should warn.
- **Mixed data types.** Dates are a mix of text and date values, and one phone is a number. The app uses proper types.

## Decisions needed and test vectors

All four decisions are made.

| Decision | Decision |
| --- | --- |
| Who maintains rate sets: organization admins, or super-admin only | Organization admins (seeded from an app default) |
| Soft payer-adult link (`Author.childId?`) | Yes |
| Own cars only in the MVP (AUP rental blocked) | Yes |
| Support the informal "agreed flat payout" from the scratch sheets, or only exact orders | Exact orders only; in the Bills document the payee can be changed while the worker and car details stay as set |

Acceptance tests for the calculation script, using both workbooks. Legs are in km; each leg is rounded to 0.1 Kč, then the total is rounded up to 0.5 Kč.

| Case | Consumption, price | Legs (km) | Sum of legs | Order total |
| --- | --- | --- | --- | --- |
| Pavel, file rates | 7.6 l/100 km, 34.70 Kč/l | 152, 12, 12, 24, 24, 6, 6, 152 | 3 312.4 | 3 312.5 |
| Pavel, rates valid on trip date | 7.6 l/100 km, 41.80 Kč/l | same | 3 521.8 | 3 522.0 |
| Kuba, file rates | 4.0 l/100 km, 34.10 Kč/l | 165, 165 | 2 397.2 | 2 397.5 |
| Kuba, rates valid on trip date | 4.0 l/100 km, 44.50 Kč/l | same | 2 534.4 | 2 534.5 |

All cases use the 5.90 Kč/km base rate and no trailer. The 2026 rate figures come from search results, not from the decree text itself. Check them against vyhláška č. 175/2026 Sb. ([epravo.cz](https://www.epravo.cz/_dataPublic/sbirky/2026/Sb_2026_175_PZZ.pdf)) before go-live.
