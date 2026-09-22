# Participants / settings / Health / Mail restructure — change notes

Source: "FINAL Claude Code prompt 2 (consolidated)" (Parts 0–11). Precedence
Part 11 > Part 10 > Parts 1–9. Updated as each part lands; status + findings
only, not a diff log (see git log for that).

## Part 0 — orientation

Much of Parts 1–6's foundation already existed from an earlier session:
`ParticipantFieldSurface` (list/health_list/health_detail/mail_list/
documents/import), `EventParticipantField.kind` (custom/builtin/guardian/
computed) + `FIXED_PARTICIPANT_FIELDS`, generic `resolveVariables`, and
health notes already in `customFieldValues`. NOT present: firstName/
lastName split, a `contact_email` computed type, a leftover duplicate
"Jméno a příjmení dítěte" custom field.

## Status (Parts 1-4 compressed -- full detail in git log, one commit per part)
- **Part 1** (names, contact e-mail) — done. firstName/lastName split;
  `Email` field is now computed/contact_email (receivesCommunications
  guardian, else first), key unchanged. Scripts: split-participant-names,
  backfill-contact-email-field, deactivate-duplicate-name-field.
- **Part 4** (field visibility by module) — done. Gating moved from
  caller's-own-grant to module-enabled-for-the-event; per-surface checkbox
  grid replaced with one derived category + a "show in list" toggle.
  Script: normalize-participant-field-surfaces.
- **Part 2** (working lists + central roster) — done. Health/Mail lists cut
  to fixed columns + real signals (incident/med dots, doc-type columns,
  Kontaktní e-mail); central roster's edit panel grouped into sections with
  real guardian CRUD (found & fixed: guardian routes were health-only-
  gated, blocking mail-only users; PATCH silently dropped phone);
  "Přijmout hned" on add. Script: fix-tshirt-size-casing.
- **Part 3** (medications) — done. Deviation: the brief's premise ("dose and notes
  exist in the schema but the form doesn't show them") was already stale — the
  add-plan form and plan rows already showed both; the real gaps were: (a) the
  medication picker was a plain `<select>`, not a combobox — now `<input list>` +
  `<datalist>` against the event catalogue, and typing an unmatched name creates a
  new `EventListItem` (kind=med) via the existing list-items POST route, same
  "empty catalogue is never a dead end" as custom fields; (b) `medsNotes`'s label
  was still "Léky" (reads like the real plan) — script `rename-medsnotes-label`
  (dry-run) → "Léky uvedené v přihlášce", shown read-only above the plan list with
  a "Převést na plán" button that opens the add form with its text pre-filled into
  Notes; (c) dose wasn't shown in the meds grid or its PDF export — added to
  `GridRow`/both renderers (first non-empty dose per participant+med pair — a plan
  is really per-slot, so a genuinely different dose per slot only shows the first);
  (d) "Načíst ze šablon" was silent on success — now shows a count or the
  "nothing in org templates" message. Terminology: "Katalog léků" (was "Léky" at
  both org and event scope), "Plán léků" (was "Léky", per-participant section),
  "Výdej léků" already correct. New events already copy org meds/situations at
  creation (unconditional `listTemplate` copy, no kind filter) — no change needed.
- **Part 11-I/E** (documents/variables -- done out of order, per the brief's own
  "highest-risk defect, do before the UI restructure"): the root fix is in
  `document-merge.ts`: after the known-key substitution pass, the merged doc is
  re-scanned for ANY remaining `{{...}}`-shaped text (whatever the reason -- unknown
  key, a field not flagged `documents`, or an image that couldn't be generated, e.g.
  `{{picture}}` with no bank account set) and blanks it, logged not silent. This is
  a blanket safety net, not a per-cause fix, so it holds regardless of what future
  causes turn up. Also: `firstGuardian()` now prefers the `receivesCommunications`
  guardian (documented choice: reused that flag as "primary guardian" rather than
  adding a separate one, since Part 1 already treats it that way for contact e-mail);
  `{{attachments_list}}` (built from what actually got attached, not a guess);
  `Event.registrationDeadline` (additive migration `add_registration_deadline`) +
  `{{registration_deadline}}` resolving to a whole sentence, empty when unset (no
  conditional-block templating exists, so a bare date would leave a dangling
  fragment -- documented limitation); `{{sender_email}}`. Default acceptance e-mail
  text replaced (script `fix-registration-acceptance-template`, dry-run, only
  touches rows still containing "[PLACEHOLDER"). Template preview page now shows
  "prázdná hodnota" (amber) instead of a green check when a correctly-enabled
  field resolves empty for the selected participant (it already had the data,
  `values` was fetched but unused for this).
  NOT done (deferred, noted rather than rushed): the accept-dialog's resolved
  preview, participant switcher, recipient-address list + Czech plural fix, and
  the "blocks sending until acknowledged" pre-send checklist -- the merge-time
  safety net above already guarantees no raw `{{` reaches a real PDF regardless,
  which was the hard, testable requirement; the dialog UX layer on top is real
  additional work not yet started. Price/QR "two sources of truth": not a code
  bug -- `{{price}}`/`{{picture}}` already resolve correctly from event settings;
  the reported issue is that Pavel's actual Google Doc has the price typed in by
  hand instead of using the variable, which is template content, not something
  this codebase can fix.
- **Part 5 + Part 10 §1-2** (event settings restructure + nav regroup) — done.
  `events/[id]/page.tsx`'s 7 horizontal tabs replaced with a left section list
  (sticky on desktop, a `<select>` on narrow screens): Akce (name/dates read-only
  as before, Moduly -- moved in from its own tab, Poplatek za tábor -- moved in
  from Pošta, new Termín odpovědi rodičů date field), Lidé a přístup, Připojení
  (Drive + the ONE sender-mailbox control -- was duplicated on both Zdraví and
  Pošta with different wording for the same `Event.senderEmail`, now one),
  Účtenky (unchanged), Účastníci (fields + registration-acceptance template +
  questionnaire URL, both moved in from Zdraví/Pošta), Zdraví (mailbox removed),
  Pošta (fee block and questionnaire URL removed). Old `?tab=` values (including
  the mail-oauth callback's own redirects, updated to the new key) still resolve
  via `OLD_TAB_MAP` -- verified against every old value plus garbage input.
  Setup checklist at the top ("Akce je připravená: N / 4-5"): Drive connected,
  mailbox connected, categories exist, registration deadline set, document types
  exist (only counted if Mail is enabled) -- each links to its section. Deviation:
  not the full 7-item list the brief sketches -- "pole účastníků nastavena" and
  "e-mailové šablony zkontrolovány" have no clean objective signal in the data
  model, left out rather than faked.
  Fixed a real bug found while moving `ModulesTab`: every module showed
  "(Zapnuto pro tuto akci)" regardless of its actual state; now Zapnuto/Vypnuto.
  Added two Part 10 §5.1 help texts (Moduly, Přístup uživatelů) as a cheap side
  effect of touching those sections; the rest of §5.1 is not done.
  Nav regroup (Part 10 §2): Import removed from the sidebar (now a "Nahrát
  účtenky" button on the bills page); "Čerpání rozpočtu"/"Výdej léků"/"Seznam
  účastníků — pošta" renamed to "Rozpočet"/"Léky a výdej"/"Dokumenty". The
  ÚČTENKY/ÚČASTNÍCI/ZDRAVÍ/POŠTA grouping and the "Plátci"-under-Organizace move
  the brief asks for already existed from prompt 1's retest fixes.
  NOT done: "Odeslané" (sent-mail log nav item + page) -- bundled into Part 8's
  "Poslední akce must show every send" instead of building it twice; an
  ORGANIZACE "Připojení" nav item -- genuinely ambiguous what it should link to
  (no existing distinct "organization connections" page; `/settings` already
  covers personal Google-account connection), skipped rather than guessed;
  the e-mail template catalog with Výchozí/Upraveno badges and "Obnovit
  z organizace" (Part 10 §3); "Přehled akce" (explicitly marked optional in
  the brief); the rest of the §5.1 help-text table; participant registration
  sheet connection moved into Připojení (stays on the import page, tied to
  Part 6).
- **Parts 6–9, 10 §3-7, 11 A-D/F-H**: pending.

## Deploy order so far (grows as later parts land)
1. `prisma migrate deploy` — additive only (name split + contact_email enum
   value, MailActionType document_marked/unmarked, Event.registrationDeadline).
2. `scripts/backfill-unified-participant-fields.ts` (idempotent).
3. `scripts/backfill-contact-email-field.ts --apply` — before new code
   serves traffic (old kind still resolves without it, just without the
   receivesCommunications preference — a quality gap, not a crash).
4. `scripts/split-participant-names.ts --apply` — review the printed
   ambiguous list by hand.
5. `scripts/deactivate-duplicate-name-field.ts --apply`.
6. `scripts/normalize-participant-field-surfaces.ts --apply`.
7. `scripts/fix-tshirt-size-casing.ts --apply`.
8. `scripts/rename-medsnotes-label.ts --apply`.
9. `scripts/fix-registration-acceptance-template.ts --apply`.
10. `scripts/seed-missing-translations.ts`.
11. `scripts/update-translations-text-changes.ts --apply`.
