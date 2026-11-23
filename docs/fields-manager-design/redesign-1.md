# Fields Manager — redesign round 1 (from the staging review, 2026-11-23)

Status: **APPROVED 2026-11-23** (all proposals agreed; answers in §7). Building step by step on staging.

Was: **proposal, not built.** Nothing in this document is programmed yet. Same rules as before: staging only,
flag-gated, released together with the rest of the package when you say so. Questions are marked **Q-R…** and
collected at the end.

---

## 0. Your question: what is "Zdroje" (Sources)?

"Zdroje" = **where a field's values come from**. Today there are three kinds:

| Source | What it means | Which fields it feeds |
|---|---|---|
| Propojení (sheet connection) | a Google Sheet imported / synced | the fields its columns are mapped to |
| Přihláška (public form) | the event's public registration form | the fields the form asks (basic + "Vyžadovat při přihlášce") |
| Rodičovský portál | parents can **edit** or **propose changes to** some profile fields in the portal | the fields set to "parents edit" or "parents propose (with approval)" |

So "parent portal" as a source means: *parents themselves can change these values.* Today clicking a source only
highlights the lines. **Proposal (R12):** clicking a source highlights its fields **and** opens its detail on the
right: for a connection the sheet link, last run, schedule, "Synchronizovat", "Upravit nastavení"; for the form the
asked fields and a link to the form settings; for the portal the list of fields parents may edit / propose, with the
access level changeable per field right there.

---

## 1. Import (your points 2–6)

### R1. One import: the old page goes, every entry point leads to Pole → Import
"Importovat účastníky" in the menu, in the participants list and everywhere else opens **Pole → Import** for that
event. The old page `/events/[id]/participants/import` is removed (its address redirects).

**Constraint you need to decide on (Q-R1):** Pole is today **organization admins only, and only with the flag on**.
The old import is also used by **event admins / people with the participants module**, and by organizations without
the flag. If the old page disappears for everyone, they lose import. My proposal:
- the new import gets the **old import's permissions** (whoever may import participants for the event), even
  without access to the rest of Pole — it is then a standalone screen "Import" reachable from the event;
- the redirect happens **per organization when its flag is on**; the old page is deleted only once every organization
  is on the new flow (with one organization in production that can be the same release in which you turn the flag on).

### R2. Saved connection = already set up
- **1. Zdroj → Uložená propojení**: each connection shows its name, sheet link (↗ opens the Google Sheet), last run
  (when, counts), schedule, and three buttons: **Synchronizovat** (runs it now with its saved settings, shows the
  result — like the old page), **Upravit nastavení**, **Odebrat**.
- Clicking a connection **does not** jump into the steps any more; only "Upravit nastavení" opens steps 2–6 with
  everything prefilled.
- **6. Import** for a saved connection shows the schedule (auto on/off, every N h) and **Uložit nastavení** /
  **Synchronizovat** directly — no need to press Importovat first.

### R3. Preview table under 2. Sloupce (as on the old page)
Under the column mapping: the table of rows with the planned result per row (new / update / no change / problem),
filter **Vše / Jen změny / Jen problémy**, the row checkbox (skip row), cell editing (the saved per-cell fix the old
page has), counts line. It updates as you change mapping. The later steps reuse the same table with their own
highlighting (values to translate, people to merge, values that differ).

### R4. "Označit dokument jako doručený" → step 6 (settings of the connection)
The document type ticked as received for every matched row. Proposal: in **6. Import**, next to the schedule, because
it is a setting of the connection, not of a column.

### R5. "Párovat podle" with all options of the old page
Name (+ birth date), registration number, **any field incl. calculated ones** (e.g. variabilní symbol from a payment
sheet — "match only"); when the chosen key can't create new people, "Nový řádek" is forced to "jen nahlásit" with the
same explanation as before. (Today the wizard offers only name + custom fields — that's a regression I'll fix.)

### R6. "Stávající hodnoty" folded into 3. Hodnoty
3. Hodnoty gets the old three-way choice at the top — **doplnit prázdné / přepsat / neměnit** (= keep / replace /
skip) — and, below, the finer levels (per section, per person, per cell) collapsed under "Podrobněji". Value
translation stays in the same step. Steps become: **1 Zdroj · 2 Sloupce · 3 Hodnoty · 4 Lidé · 5 Import**.

---

## 2. Přehled + Pole merged into one working screen (your points 7–9, 11–13)

### R7. One screen
Tabs **Přehled** and **Pole** merge: the diagram stays on the left, the right panel becomes the **full field editor**
(everything the Pole tab can do: storage, required, rename, type/options, calculated spec with the same editor as
"Nové pole", portal access, where used). Under the diagram (or as a toggle) the **list view** remains for people who
prefer a table — same right panel. **+ Nové pole** is on this screen and opens the same editor on the right.

Each card in the diagram shows the label **and the key**: *Datum narození · `datum_narozeni`*.

### R8. Everything changeable in one place — or a direct link
Every property shown on the right is either **editable there** or has a **"změnit v …" link** to the exact place in
the app (e.g. "E-mail odesílatele" → Nastavení akce → Pošta, field focused). Rule I'll follow: editable in place when
it's a simple value of the event / organization / field; a link when it's part of a bigger setting with its own rules
(price rules, health-notes configuration, portal sections).

### R9. Calculated / built-in values become visible, explained and configurable
I go through **every** built-in and calculated value and give each a definition on the right: *what it prints, from
what, in which cases*, and what can be changed. Proposed list (Q-R2 for each one where I changed behaviour):

| Key | Today | Proposal |
|---|---|---|
| **Email** (participant contact e-mail, computed) | first guardian with "receives communications", else first guardian | a **configurable rule**: under 18 → guardian(s) receiving mail; 18+ → the participant's own e-mail if there is one, else guardian; for events **without** the people database (participant list only) the same rule on the participant's own guardians; choices: "first guardian / all guardians receiving mail / participant", order editable. (Q-R3: the 18+ rule — today it always picks a guardian.) |
| full_name / Name | first + last name | shown as calculated; order (first-last / last-first) choosable |
| Věk (age) | `vek_ucastnika` typed by hand | calculated from birth date at event start (agreed earlier as an option) |
| Cena (effective_price) | price rules | definition shown + link to price rules |
| Variabilní symbol | VS rules | definition shown + link to VS settings |
| Členství (membership_status) | member values | definition + editable member values |
| Cenová kategorie, Stav údajů, QR platba | code | definition + link |

### R10. Event variables: only what is really event-level
You're right that several "event variables" are not event-level. Today's list mixes three things; proposal:
- **Akce (event-level, one value per event):** název akce, termín, začátek, konec, místo, ceny, účet, kontaktní e-mail
  akce, e-mail odesílatele, uzávěrka, odkaz na dotazník, název organizace → each **editable on the right** (they are
  event / organization settings) or linked.
- **Účastník (per person, built in):** jméno účastníka, zdravotní poznámky, seznam dokumentů, odkaz do portálu, odkaz
  na doplnění údajů → these move out of "event variables" into the participant's calculated fields, each with its
  definition (e.g. zdravotní poznámky = the fields chosen in Zdraví → Poznámky, link there).
- **Věty (sentences):** *questionnaire_line, registration_deadline_line, portal_link_line, details_link_line* — a sentence
  printed only when its value exists. Proposal: their **text becomes editable** on the right (cs/en, with the value
  as `{…}`), "empty when the value is missing" stays. (Q-R4: is editable text wanted, or just shown?)
- Your own variables (Hlavní vedoucí…) stay as they are.

Note: there are today **two different "contact e-mails"** — the event's contact e-mail (`contact_email`, event-level)
and the participant's contact e-mail (`Email`, per person). The redesign names them clearly: *Kontaktní e-mail akce*
vs. *E-mail pro komunikaci s účastníkem*.

### R11. "Clever assistant" behaviour (how I read your intent)
On the right panel, under the definition, short **hints the manager computes**: "12 participants have no e-mail for
this rule", "this field is required in the form but parents can't see it in the portal", "used in 3 documents but
switched off for documents in this event", "the old name `zast_jmeno` is still used in 2 templates — update?".
Each hint has its one-click fix where one exists. (Q-R5: OK to start with a fixed set of such checks, extended later?)

---

## 3. "Kde se používá" with selection and Ctrl-click (your points 10, 14)

### R13. Click shows connections; Ctrl-click changes them
- Click a **field** → its places light up (lists & exports, health, documents, e-mails, portal, form…) and the right
  panel shows the details.
- Click a **place** (e.g. Seznamy a exporty) → all fields enabled there light up; the right panel shows that place's
  settings (e.g. which columns are visible by default) with a link to the place.
- **Ctrl/⌘-click** while something is selected toggles the connection: field selected + Ctrl-click a place = enable /
  disable the field there; place selected + Ctrl-click a field = the same from the other side. Each toggle is saved
  immediately and shown as "uloženo · vrátit". (Q-R6: immediate save, or collect and confirm? I propose immediate with
  a one-step undo.)
- Plain click on another item adds it to the selection (to compare several); Esc clears.

### R14. Documents as one place
"Kde se používá" shows **Dokumenty** as one place instead of one column per document. Selecting it (or a field) shows
on the right the list of document templates: *uses the field / field enabled for documents but the template doesn't
use it / doesn't use it* — switch for "available in documents" for all at once, and per document a link to the
template in Dokumenty (the editor from phase 6). Other places get the same kind of detail panel (what it is, what the
setting does, link).

---

## 4. Úklid (your point 15)

### R15. Proposed duplicates, "not a duplicate" remembered, and real data preview
- **Návrhy:** besides the agreed groups, the manager proposes possible duplicates by itself: similar labels / keys
  (alergie / allergies), the same values in most people, one field filled where the other is empty. Each proposal:
  **Sloučit…** or **Není duplicitní** — remembered (stored in the change log, no new table), never proposed again.
- **Already merged:** listed with what happened (kept field, merged fields, mode) and undo / delete as now.
- **Preview table with real data** before every merge / make-calculated: one row per person — kept field's value,
  merged field's value, **result**, marked *doplní se / liší se (zůstane …) / beze změny*; filter like in import.
  Same table pattern as R3, so import, review queue and clean-up look and work the same.
- **Ke kontrole** stays separate (it is per event and fed by automatic syncs); the clean-up is organization-wide.
  They share the table component only.

---

## 5. Order of work (proposal)

| Step | What | Size |
|---|---|---|
| A | Import: R1 (with Q-R1), R2, R3, R4, R5, R6 | large |
| B | Merged screen: R7, R8, keys on cards, + Nové pole on the screen | large |
| C | Variables: R9, R10, R11 | large (touches mail / documents code — each change behind the flag, golden documents re-checked) |
| D | Kde se používá: R13, R14 | medium |
| E | Úklid: R15 | medium |
| F | Zdroje detail: R12 | small |

Each step: staging only, tests as before, your check, then the next. The whole package is released only when you say
so (flag off in production until you switch it on).

---

## 6. Questions

- **Q-R1.** Old import removal: OK that the new import keeps the old import's permissions (event admins / participants
  module) and the switch happens per organization with its flag? Or do you want it for organization admins only?
- **Q-R2.** For each built-in in R9 where I propose a change (Email rule, age, name order): change it, or only show it
  and keep today's behaviour as the default setting?
- **Q-R3.** Participant contact e-mail for 18+: participant's own e-mail first, guardian as fallback — correct?
- **Q-R4.** The "sentence" variables (…_line): editable text per event / per organization, or only explained?
- **Q-R5.** The assistant hints (R11): start with a fixed set of checks (I'd list them before building)?
- **Q-R6.** Ctrl-click changes: save immediately with undo, or collect changes and confirm?
- **Q-R7.** Order of work A → F as above, or something first?

## 7. Answers (2026-11-23)

- All proposals agreed.
- **Q-R1:** yes — the new import keeps the old import's permissions; switch per organization with its flag.
- **Q-R2:** change them (contact e-mail rule, age calculated, name order choosable).
- **Q-R3:** as proposed — 18+: participant's own e-mail first, guardian as fallback.
- **Q-R4:** editable text where reasonable; only a sentence with many condition-based variants may stay a link to
  the right place.
- **Q-R5:** yes — a fixed set of checks, listed before building (step C).
- **Q-R6:** Ctrl-click saves immediately (with undo).
- **Q-R7:** order A → F.
- **Addition (R12, parent portal):** Ctrl-click adding of fields to the portal source as in R13, plus drag & drop of
  fields between *základní* and *podrobné* (basic / detailed level) — that decides what parents see and when.
