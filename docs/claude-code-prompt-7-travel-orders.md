# Prompt 7 — Travel orders ("Cestovní příkazy") in Bills + vehicle registry + rate sets (phase 1)

Status: ready to hand to Claude Code. Source of truth for the *why*: the design doc "Travel orders (Cestovní příkazy) — design for the Bills module" (Claude doc). Pavel will save it as `docs/travel-orders-design.md` before you start; **read it first**. This prompt is the source of truth for *what to build*, and overrides the doc where they differ (section "Differences from the design doc").

Read `AGENTS.md` and the relevant guides in `node_modules/next/dist/docs/` before writing any routing code (this is not the Next.js you know).

Work in two parts. **Finish, verify and commit Part A before starting Part B.** Commit after every working step (`git add -A && git commit -m "..."`), run `npx tsc --noEmit` after every change, run `npx prisma generate` explicitly after every `prisma migrate dev`, additive migrations only (follow how the latest migrations in `prisma/migrations/` were made). Reuse the conventions of prompts 2 FINAL / 3 / 5 / 6: sidebar structure, settings layout, `Translation` keys (cs + en, seed script like `scripts/seed-bank-i18n.ts`), shared `ConfirmDialog`, Night/Ember/Paper/Pine tokens, in-app help (`content/help/`, `src/lib/help-content.ts`), Czech plurals via `src/lib/plural.ts`. Do not stop for confirmation between steps; report at the end. Stop and ask only if a check below contradicts a rule in this prompt.

## Non-negotiable rules (Pavel's decisions)

1. **Exact orders only.** No "agreed flat payout" flow. The amount is always computed from legs, km and the rate set.
2. **Own car only (AUV) in phase 1.** Do not offer rental cars (AUP). The old Excel template ignored the vehicle kind in its formula, so do not copy that. Do not build stravné rules: the columns stravné / nocležné / vedlejší výdaje exist per leg as optional manual amounts and are added to the total exactly as in the template. The "free meals / lodging provided" flags are stored and printed but change no amount.
3. **Rate sets are organization-level, versioned by valid-from date, maintained by organization admins** (no super-admin-only page). They are NOT keyed by year: Czech decree prices changed twice during 2026.
4. **A submitted order is frozen.** It stores snapshots of the worker, vehicle, payout, the rate set id and the rate values, the consumption used and every computed amount. Later edits of rates, people or cars never change it.
5. **Worker and car are separate from the payee.** The order keeps the worker and vehicle details as set. The payee of the resulting bill can later be changed to another person, and that change touches only the payee name, payout account and payment QR (and regenerates the PDF); it never edits the worker or car. It is written to `BillAuditLog`.
6. **Deterministic calculation in one pure function** with a runnable self-check script (pattern `scripts/check-bank-*.ts`, `assert`-based, run with `npx tsx`). No JavaScript floats: use Prisma's `Decimal` (decimal.js) with `ROUND_HALF_UP`. Report if you need any new dependency.
7. **Organization isolation.** Everything new carries `organizationId` or goes through `requireEventInOrg` / `getActingOrgId` / `orgWhere` (`src/lib/org-scope.ts`). Something outside the acting organization is a 404. Extend `scripts/check-org-scope.ts` (and `tsconfig.org-isolation.json` if needed) to cover every new table and route, and keep it passing.
8. **People are not duplicated.** No new people table. A vehicle points to an adult in Lidé (`Child` with `isAdult`) and/or to a payer (`Author`), both optional. `Author` and `Participant` stay separate concepts; the new link `Author.childId?` is a soft link for adults only, never a merge.
9. **Travel-order bills skip the AI pipeline.** They never enter `new → queued → processing`.
10. Everybody is told not to enter sensitive data; plates, addresses and bank accounts are personal data, so show them only where needed.

## Differences from the design doc (this prompt wins)

- Rate set maintenance: **organization admins** (the doc's tier table already says organization level).
- Access to the vehicle registry (default, Pavel did not object): org admins create, edit and archive everything; a user with Bills access on an event can list vehicles and create new ones for adults or payers belonging to that event, and cannot edit others.
- The signed-scan-back-to-the-bill idea is **out of scope** for phase 1.

## Before writing code — check, don't assume

Report what you find for each:

1. **Bill model and pipeline**: `Bill`, `BillStatus`, where the AI pipeline is triggered (upload, Drive ingest, Cloud Tasks), how `to_review → approved` works, which fields are required (GCS path, contentHash, driveSourceFileId, amountCzk and rate fields). Propose the smallest additive change that lets a bill exist without a scan (for example `Bill.source` enum `scan | travel_order`) and say which queries, list filters, export and Drive code assume a scan exists.
2. **Payers**: `Author`, `AuthorEventAccess`, `mergedIntoAuthorId`, bank account fields, and whether address or phone exist on `Author` and on `Child`. Say exactly which nullable columns you will add (`Author.childId`, phone, address as needed). If a phone or address field already exists on `Child` / guardians, reuse it and say so.
3. **People model**: `Child` (`isAdult`, `leftAt`), `EventPerson` (from prompt 6, if already merged), the Lidé page (`/children`) and what address fields adults have.
4. **Organization settings**: where name, address, IČO and a city (for "V Praze dne") live. If a field is missing, add a nullable column and a field in the organization settings.
5. **Module access**: how the Bills module checks event access (`src/lib/module-access.ts`), the org-admin shortcut, and which organization pages exist under Organizace (templates, exchange rates). The new pages go there.
6. **Payments and QR**: how the payment QR for a payer is generated today and from which fields, so the travel-order bill reuses it.
7. **Bills list**: the column picker, filters, and the bill editor modal; how to show a "Cestovní příkaz" badge and open the travel-order detail instead of the scan editor.
8. **Export**: the Drive export and the manifest sheet columns: confirm what a travel-order bill (no scan, generated PDF) must provide for them to work.
9. **Bank reconciliation** (prompt 5, if merged): confirm that reimbursement pairing by payer works for a travel-order bill without changes.
10. **PDF**: `src/lib/pdf-service.ts`, `planning-pdf.ts` and the installed libraries. Report before adding a dependency.
11. **Organization creation**: how a new organization gets its templates seeded, so a new organization also gets the rate-set defaults.
12. **i18n and help**: the structure of the latest seed script and how help pages are registered.

---

## PART A — Foundation: rate sets, calculation, vehicles and people links

### A1. Calculation spec (implement exactly; `src/lib/travel-order-calc.ts`)

Inputs: rate set, vehicle (fuel, gearbox, TP values 1–4), optional receipt price per unit, legs `[{km, trailer, stravne, nocleh, vedlejsi}]`.

- **Consumption.** TP values = those of TP1–4 that are non-null and greater than 0. If there is at least one: `consumption = round(sum / count, 2)`, source `tp`. Otherwise take the rate set's default table by fuel group and gearbox, source `table`. Fuel groups: petrol (Natural 95 and Natural 98 share one row), diesel, electric (default 0).
- **Price per unit.** The receipt price if given, otherwise the rate set price for the fuel (Kč/l; electricity Kč/kWh).
- `fuelPerKm = consumption × price / 100`, full precision, no rounding.
- `legKmAmount = ROUND_HALF_UP(km × (fuelPerKm + (trailer ? basePerKm × (1 + trailerPct/100) : basePerKm)), 1)`.
- `legTotal = legKmAmount + stravne + nocleh + vedlejsi`.
- `orderTotal = CEILING(sum of legTotal, 0.5)`.
- Also return the informational summary lines the printed settlement shows: total km, consumption, price, "náhrada za PHM" = `km × consumption × price / 100` and "km × sazba" = `km × basePerKm + trailerKm × basePerKm × 0.15`, both unrounded.

Inputs are validated: km > 0 on a used leg, non-negative amounts, one fuel type, receipt price > 0.

### A2. Rate sets

- **`TravelRateSet`**: `organizationId`, `validFrom` Date, `basePerKm`, `trailerSurchargePct`, `dieselPrice`, `petrol95Price`, `petrol98Price`, `electricityPrice`, `consumptionDefaults Json` (`{ petrol: {manual, auto}, diesel: {manual, auto}, electric: {manual, auto} }`), `note String?` (source), timestamps. Unique `(organizationId, validFrom)`.
- **Selection:** the set with the greatest `validFrom` not later than the trip start date. One set per order.
- **Seed (`scripts/seed-travel-rates.ts`, for every existing organization, idempotent).** These values come from the Czech decrees for 2026 and **Pavel verifies them against vyhláška č. 573/2025 Sb. and č. 175/2026 Sb. before go-live**; keep them as clearly labelled constants and put the decree reference in `note`:

| validFrom | base Kč/km | trailer % | diesel | Natural 95 | Natural 98 | electricity |
|---|---|---|---|---|---|---|
| 2026-01-01 | 5.90 | 15 | 34.10 | 34.70 | 39.00 | 7.20 |
| 2026-06-01 | 5.90 | 15 | 44.50 | 34.70 | 39.00 | 7.20 |
| 2026-10-01 | 5.90 | 15 | 44.50 | 41.80 | 39.00 | 7.20 |

  Default consumption table in each row (copied from the Excel template, source unknown, mark it so in `note`): petrol manual 6.9 / automatic 7.6; diesel manual 5.8 / automatic 6.4; electric 0 / 0.
- **Page `Organizace → Sazby cestovních náhrad`** (org admins only): list sorted by `validFrom` descending, add / edit / delete, button **Zkopírovat z předchozí** (new `validFrom`, everything else copied), and a warning banner when an event of the organization starts on a date with no valid set ("Pro akci X chybí sazby platné od …"). Plain diagnostic messages in the style of the Drive diagnostics: say exactly what is wrong and what to change.
- Add the new organization default to the organization-creation flow (check 11).

### A3. Vehicles and people links

- **`Vehicle`** (org): `organizationId`, `label` (e.g. "Kia Ceed"), `cylinderCc Int?`, `plate`, `gearbox` enum `manual | automatic`, `fuel` enum `diesel | petrol95 | petrol98 | electric`, `tpConsumption1..4 Decimal?`, `ownerChildId?` (must be `isAdult`, same organization), `ownerAuthorId?` (same organization), `ownerName String?` (fallback when neither link exists), `archivedAt?`, timestamps. At least one of the three owner fields is required (app check).
- **`Author`**: add `childId String?` (soft link to an adult), plus phone and address columns only if check 2 shows they do not exist.
- **Registry page `Organizace → Vozidla`**: table (owner, label, plate, fuel, gearbox, consumption shown as "z TP" or "tabulka"), add / edit / archive (never delete a vehicle used by an order), search. Editing rules per "Differences".
- **Linking:** in the payer detail, **Propojit s dospělým** (search adults, same organization) and the reverse hint in the adult detail. When a search finds an adult and a payer with the same name, offer **Propojit** instead of creating a duplicate. Never auto-link silently.
- **Phone** is normalized to `+420 xxx xxx xxx` on save (the old files stored one as a number).

### A — verify before commit

1. `npx tsx scripts/check-travel-calc.ts` passes with these cases (km legs, 5.90 base, no trailer unless stated):

| Case | Consumption, price | Legs (km) | Sum of legs | Order total |
|---|---|---|---|---|
| Pavel, 2026-01 rates | 7.6 (table: petrol, automatic), 34.70 | 152, 12, 12, 24, 24, 6, 6, 152 | 3 312.4 | 3 312.5 |
| Pavel, 2026-10 rates | 7.6, 41.80 | same | 3 521.8 | 3 522.0 |
| Kuba, 2026-01 rates | 4.0 (TP), 34.10 | 165, 165 | 2 397.2 | 2 397.5 |
| Kuba, 2026-06 rates | 4.0 (TP), 44.50 | 165, 165 | 2 534.4 | 2 534.5 |

   Also cover: TP average of two values and ignoring zero / null; table fallback for all fuel and gearbox combinations; electric with default 0; receipt price override; a trailer leg; per-leg half-up rounding at exactly x.x5; the total ceiling at exact 0.5 boundaries; manual stravné / nocležné / vedlejší added before the ceiling; invalid inputs. Compute the extra expected values by hand (or independently) and show your arithmetic in the script comments.
2. Rate-set selection: a trip starting 2026-05-31 uses the 2026-01 set, 2026-06-01 uses the 2026-06 set, 2026-10-01 the 2026-10 set; no set before 2026-01-01 → a precise message.
3. Org isolation: an admin of another organization gets 404 on every rate set, vehicle and link route; `scripts/check-org-scope.ts` passes.
4. A non-admin cannot open or edit the rate-set page; a user with event Bills access can create a vehicle for an adult of the event but gets 403 editing another vehicle.
5. Seed script run twice creates no duplicates.

---

## PART B — Travel order and the bill

### B1. Data

- **`TravelOrder`**: `organizationId`, `eventId`, `billId String? @unique` (set on submit), `status` `draft | submitted`, `workerChildId?`, `workerAuthorId?`, `vehicleId?`, **snapshots**: `workerName`, `workerAddress`, `workerPhone`, `vehicleLabel`, `vehiclePlate`, `cylinderCc`, `gearbox`, `fuel`, `tpValues Json`, `consumptionUsed Decimal`, `consumptionSource` (`tp | table`), `fuelPriceUsed Decimal`, `priceFromReceipt Boolean`, `rateSetId`, `rateValues Json` (the full set as used), `purpose`, `originPlace`, `destinationPlace`, `roundTrip Boolean`, `startAt`, `endAt`, `approvalDate`, `approverName String?`, `coTravellers String?`, `freeMeals Json` (ubytování, snídaně, oběd, večeře), `receiptBillId String?` (optional link to an existing bill with the fuel receipt), `totalKm`, `totalAmount`, `pdfPath String?`, `submittedAt?`, timestamps.
- **`TravelLeg`**: `orderId`, `sortOrder`, `date`, `fromPlace`, `toPlace`, `departTime`, `arriveTime`, `trailer`, `km Decimal(8,1)`, `stravne`, `nocleh`, `vedlejsi`, `amount` (computed, stored on submit).
- **`KnownDistance`** (org): `fromPlace`, `toPlace`, `km`; filled from submitted orders as suggestions only, never applied silently.
- The `Bill` change from check 1 (additive).

### B2. Pages and flow

- Page `/events/[id]/travel-orders` in the Účtenky section: list (worker, dates, total, status draft / submitted, bill status) and **Nový cestovní příkaz**.
- **Order form** (one page, labelled inputs, Czech):
  - **Pracovník:** one picker searching the event's adults (`EventPerson`) and the event's payers together, de-duplicated by name; picking fills address and phone from what is stored and lets the user fix them for this order. Missing data is flagged next to the field, not blocking until submit.
  - **Vozidlo:** the owner's vehicles, or add a new one (inline, same rules as A3).
  - **Cesta:** purpose (default = event name), origin, destination (default = event place if set), round trip, start and end date-time, approval date, approver name, co-travellers (text), free meals / lodging flags.
  - **Legs table:** date, from, to, departure, arrival, trailer, km, optional stravné / nocležné / vedlejší; the **known-distance** suggestion fills km when from and to match (user confirms by leaving it). Row add / remove.
  - **Fuel price:** the rate set price with a switch **Použít cenu z účtenky** (price per unit), optional link to a bill.
  - **Live calculation panel:** rate set used (with its valid-from), consumption and its source, price per unit, price per km, each leg amount, total. If no rate set is valid for the start date: drafts use the latest set with a badge **předběžná sazba**.
  - **Warnings (do not block):** a leg time outside the order start–end window; legs not continuous (a leg starts somewhere the previous one did not end); a long leg without a trailer flag is fine, no warning.
  - **Blocking on submit only:** no rate set valid for the start date (message: which date, which page to open), no worker, no vehicle, no legs with km, missing payout details when the payout is a bank transfer.
- **Odeslat:** freezes everything, writes snapshots, creates the `Bill`: amount = order total in CZK (no exchange rate), payee = the worker's payer (create the payer from the worker if there is none, attached to the event, with bank details from the form), category "Doprava" (create the category in the event if missing, following how categories are added today), merchant = worker name, document = the generated PDF, status straight to the review state of check 1 (no AI). A submitted order is read-only except by **Znovu otevřít**, which reopens it as an audited action (follow how bills are reopened) and recalculates with the same frozen rate set.
- **Payee change:** in the bill, the payee dropdown works as for any bill. Changing it updates payout name, account and QR and regenerates the PDF; the worker and vehicle block on the order stays untouched. Show both blocks on the PDF: "Pracovník / vozidlo" and "Vyplatit".
- **Bills list:** badge "Cestovní příkaz"; opening such a bill goes to the travel-order detail (read-only summary, PDF preview, payee change, link back to the order).
- **PDF** (two pages, A4, one stored file): page 1 "CESTOVNÍ PŘÍKAZ" with organization name, address, "IČ: …", trip from–to, places, worker, address, phone, vehicle, cm³, consumption and fuel type, plate, co-travellers, purpose, declaration text, payout form and account, place and date, signature lines (worker, approver). Page 2 "VYÚČTOVÁNÍ PRACOVNÍ CESTY" with the legs table (date, depart–arrive, trailer, km, jízdné, stravné, nocležné, vedlejší, celkem), totals, the summary lines from A1, the free-meals flags, the statement "Prohlašuji, že jsem všechny údaje uvedl plně a správně.", date, signature, and the payment QR when paying by bank transfer. Declaration texts are default `Translation` keys; the city for "V … dne" comes from the organization.
- Export and manifest: a travel-order bill goes through Drive export like any bill (check 8), and the manifest shows the worker as payer.

### B3. Help, translations, small things

- `content/help/cestovni-prikazy.md`: what the module does, rate sets by date (and why not by year), vehicle registry, payee change, what freezes on submit, what is not included (rental cars, stravné rules, flat payouts).
- All strings via `Translation` keys cs + en with `scripts/seed-travel-i18n.ts`; plurals for cesta / úsek / vozidlo.
- Sidebar items: `Cestovní příkazy` (event, Účtenky section), `Sazby cestovních náhrad` and `Vozidla` (Organizace).
- Add `Zkopírovat z předchozí` copy-and-warning behaviour to the help page.

### B — verify before commit / deploy

Use a test event with two adults assigned and two payers attached (one adult linked to a payer, one not).

1. Recreate both Podzimky orders from the Excel files (Pavel: 8 legs, Kuba: 2 legs) with the **2026-10-01** rates: totals **3 522.0 Kč** and **2 534.5 Kč**, matching `check-travel-calc.ts`.
2. Draft is not visible in the bills list; submitting creates exactly one bill, no AI status ever appears, the PDF opens and matches the layout above.
3. Changing the rate set after submit changes nothing on the submitted order; **Znovu otevřít** recalculates with the frozen set.
4. A trip starting 2026-05-31 and a trip starting 2026-06-01 use different diesel prices.
5. No valid rate set: draft shows **předběžná sazba**, submit is blocked with the exact message.
6. Payee change: bill payee, QR and PDF payout block change; worker and vehicle snapshots are byte-identical; an audit row exists.
7. Linking a payer to an adult updates the picker (one entry instead of two); a vehicle owned by the adult appears for the payer's orders.
8. Warnings appear for Kuba's leg at 14:00 against a 15:00 start; they do not block.
9. Org isolation and permissions as in Part A; `scripts/check-org-scope.ts` passes.
10. Drive export and, if merged, bank pairing work for a travel-order bill.
11. All self-checks pass: `npx tsx scripts/check-travel-calc.ts` and the existing check scripts.
12. Report: findings for all 12 checks, what was reused, any new dependency with the reason, migrations, the seed commands to run (`seed-travel-rates.ts`, `seed-travel-i18n.ts`). Commit, deploy (run the seed scripts against the live DB), tell Pavel what to test and to verify the rate values against the decrees.

## Out of scope

Rental cars (AUP), automatic stravné and lodging rules, flat or agreed payouts, signed-scan attachment, foreign trips, yearly report per driver (small follow-up), organization-specific rate overrides, global rate sets, tax reports, a link from receipts' line items, and any change to the AI pipeline.
