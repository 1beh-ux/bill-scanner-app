# Use-case test: Registrace 2027 (staging)

**Goal.** The 2026 members become the base in Lidé; each has their signed registration list (PDF) stored on the
person; they get a portal link and register for 2027 there; since the registration list is already there, they only
pay, and the registration is complete. Next year: create 2028, open it in the portal, done.

Everything here is **staging only** (organization *Pionýrská skupina Záře*, the production copy). All people and
values are **invented**. Prepared 2026-11-24.

---

## 1. What is prepared on staging

| Thing | Where | State |
|---|---|---|
| Document template **Registrační list (TEST)** — *platí trvale* | Šablony → Dokumenty (Záře) | key `test_registracni_list`; a file stored on the person covers it in every event |
| Document template **Platba (TEST)** | Šablony → Dokumenty (Záře) | key `test_platba` |
| Event **TEST Členství 2026** | Akce | membership year 2026; documents: *Registrační list (TEST)* only; people are created on import |
| Event **TEST Registrace 2027** | Akce | membership year 2027; **portal open** for people with an accepted 2026 registration; **accepted automatically**; documents: *Registrační list (TEST)* + *Platba (TEST)* (= the payment document); price 600 Kč; deadline 31. 1. 2027; public page `/r/test-registrace-2027` for new members |

Setup scripts (re-runnable, staging only): `scripts/staging/setup-registrace-test.ts`,
`scripts/staging/registrace-test-doctypes.ts`; import dry run (writes nothing):
`scripts/staging/registrace-test-dryrun.ts`.

## 2. Test data (this folder)

- `clenove-2026.csv` — the member list (10 people, Záře's real column names).
- `pdf/` — 9 registration lists (one member deliberately without: P04). Invented content, marked "TESTOVACÍ".

| ID | Person | Born | Type | Guardian / contact | PDF | Scenario |
|---|---|---|---|---|---|---|
| P01 | Tobiáš Nováček | 12. 4. 2015 | child, Odvážní | Petra Nováčková | ✓ | A – happy path, **siblings** (with P02) |
| P02 | Ema Nováčková | 3. 9. 2017 | child, Dráčci | Petra Nováčková | ✓ | A – sibling: one parent, two children in one go |
| P03 | Kryštof Lesní | 22. 1. 2014 | child, Teetové | Jan Lesní | ✓ | A – single child, payment marked by hand |
| P04 | Matyáš Potůček | 30. 6. 2016 | child, Marťánci | Lenka Potůčková | ✗ | B – **no registration list**: parent uploads it in the portal → review → approve |
| P05 | Viktorie Skalová | 15. 11. 2013 | child, Odvážní | Martin Skala | ✓ | C – **changes the address** while registering (approval) |
| P06 | Radek Dubský | 8. 2. 1985 | **adult** member | himself | ✓ | D – adult registers **himself and his son** (P07) |
| P07 | Filip Dubský | 19. 5. 2018 | child, Dráčci | Radek Dubský | ✓ | D – child of an adult member |
| P08 | Barbora Hájková | 1. 7. 1998 | **adult** member | herself | ✓ | E – adult alone |
| P09 | Anna Březinová | 24. 12. 2015 | child, Teetové | Tereza Březinová | ✓ | F – registers but **doesn't pay** → stays unpaid, reminder |
| P10 | Ondřej Klíma | 9. 3. 2012 | child, Odvážní | Petr Klíma | ✓ | G – document marked **"Neplatí"** → must bring a new one |
| — | Šimon Javor | 2016 | child, not a member | — | — | H – **not in 2026** → no portal offer; registers on the public page |

E-mails are `…@example.invalid`; on staging every e-mail goes to you anyway (redirect).

---

## 3. The test — step by step

| # | Who | Where | Do | Expected |
|---|---|---|---|---|
| 1 | admin | Pole → Nástroje → **Import** (event *TEST Členství 2026*) | Paste / upload `clenove-2026.csv` | Columns map by themselves (15 of 16; *Registrační list (soubor)* stays "nepřevádět"). Plan: **10 nových**, no problems |
| 2 | admin | Import → Lidé → Import | Import | 10 participants in *TEST Členství 2026*; 10 people in **Lidé** (with guardians) |
| 3 | admin | Seznam účastníků (*TEST Členství 2026*) | Select all → **Přijmout** | 10 × přijato (needed: the 2027 portal offer is for **accepted** 2026 members) |
| 4 | admin | Lidé → each person → Dokumenty | Upload the person's PDF as **Registrační list (TEST)** (P04: nothing) | 9 people with the document "platí trvale" |
| 5 | admin | Seznam účastníků (*TEST Registrace 2027*) | (look) | Empty – nobody registered yet |
| 6 | admin | Pošta (*TEST Členství 2026*) | E-mail to all with `{{portal_link}}` ("Registrace na rok 2027 je otevřená…") | 10 e-mails (to you on staging), each with a portal link |
| 7 | parent P01/P02 | portal link | Open → card **TEST Registrace 2027** → register both children | Fields pre-filled from Lidé; **accepted** at once; *Registrační list* = received **"z profilu"**; *Platba* = missing |
| 8 | admin | Seznam (*2027*) → P01, P02 | Mark **Platba (TEST)** received | Status → **kompletní** (confirmed) |
| 9 | parent P03 | portal | Register → admin marks payment | kompletní |
| 10 | parent P04 | portal | Register; upload the registration list in the portal | *Registrační list* = **čeká na kontrolu**; status *čeká* |
| 11 | admin | Seznam (*2027*) → P04 → document | **Schválit**; mark payment | received → kompletní; the file is also kept on the person (next year it counts) |
| 12 | parent P05 | portal | Register; change the street | A **change proposal** waits in Lidé → Ke kontrole (field set to "navrhují") |
| 13 | admin | Lidé → Ke kontrole | Approve the change; mark payment | profile updated; kompletní |
| 14 | adult P06 | portal | Register himself + Filip (P07) | two registrations, both accepted, both "z profilu" |
| 15 | adult P08 | portal | Register herself | accepted, document from profile |
| 16 | parent P09 | portal | Register, don't pay | status stays **chybí platba**; Pošta → reminder e-mail to the unpaid ones finds her |
| 17 | admin | Lidé → P10 → Dokumenty | Mark the registration list **Neplatí**; then P10 registers | *Registrační list* = missing → the parent must upload a new one (as P04) |
| 18 | new family (H) | `/r/test-registrace-2027` | Register Šimon as a new member | No portal offer for him before; new family + person in Lidé (Ke kontrole), registration accepted, document missing |
| 19 | admin | Pole → Formulář (*2027*) | (look) | The form as parents see it; registration list asked as a document, not as a question |

**Next year (2028) – the check of "it's only about creating 2028":**

| # | Do | Expected |
|---|---|---|
| 20 | Duplicate *TEST Registrace 2027* → *TEST Registrace 2028* (dates 2028); eligibility: accepted in **2027** | The same documents and settings |
| 21 | Open it in the portal | Everyone complete in 2027 sees the 2028 card; the registration list counts again **"z profilu"** (unless the 2028 document type is set to *vyžadovat nový*) |

---

## 4. Points to watch (found while preparing)

1. **Imported 2026 rows start as "čeká".** The 2027 portal offer needs an **accepted** 2026 registration → step 3.
2. **Column guessing (fixed on staging):** in the new import, "Oddíl / členství ve skupině" used to be guessed as the
   built-in *Skupina* and "Kontaktní email dítěte" as **guardian 2's e-mail**. Now a column named exactly like a field
   goes to that field (the old import page keeps its old guessing).
3. **Siblings (P01, P02):** check they end up in **one family** with one portal link (same guardian e-mail).
4. **Adult members (P06, P08):** the "Pohlaví" options are *Dívka / Chlapec*; the CSV leaves it empty for adults
   — check the form doesn't require it for adults.
5. **Uploading 9 PDFs by hand** (step 4) is slow for the real list. The app can match a Drive folder of PDFs to people
   by name (bulk document import); to test that on staging the PDFs would have to go into the staging Drive folder —
   **needs your yes** (it creates files in Google Drive).
6. **Payment** is marked by hand here (no bank on staging). In production *Platba* can be ticked by the bank check
   (Fio) automatically.

## 5. Results

| # | Result | Note |
|---|---|---|
| dry run (import plan) | ✓ 10 new, 0 problems | after the guessing fix (point 2) |
| 1–21 | *to be run* | |
