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
  "highest-risk defect, do before the UI restructure"): root fix in
  `document-merge.ts` -- after the known-key substitution pass, the merged doc
  is re-scanned for ANY remaining `{{...}}`-shaped text (unknown key, a field
  not flagged `documents`, an image that couldn't generate) and blanks it,
  logged not silent -- a blanket safety net, not a per-cause fix. Also:
  `firstGuardian()` now prefers the `receivesCommunications` guardian (reused
  that flag as "primary guardian" rather than adding a separate one);
  `{{attachments_list}}`/`{{sender_email}}`; `Event.registrationDeadline` +
  `{{registration_deadline}}` (whole-sentence, empty when unset -- no
  conditional-block templating exists). Default acceptance e-mail text
  replaced (only rows still containing "[PLACEHOLDER"). Template preview page
  shows "prázdná hodnota" (amber) instead of a green check when a field
  resolves empty. NOT done: accept-dialog resolved preview/participant
  switcher/recipient list UX (the merge-time safety net already guarantees no
  raw `{{` reaches a real PDF, which was the hard requirement). Price/QR
  "two sources of truth" is template content (hand-typed price in Pavel's
  actual Doc), not a code bug.
- **Part 5 + Part 10 §1-2** (event settings + nav) — done. 7 horizontal tabs ->
  left section list (Akce incl. Moduly/fee/new deadline date, Lidé a přístup,
  Připojení with ONE sender-mailbox control instead of duplicated-with-different-
  wording on two tabs, Účtenky, Účastníci incl. acceptance template + questionnaire
  URL, Zdraví, Pošta). Old `?tab=` values (incl. the mail-oauth callback's own
  redirect) still resolve via `OLD_TAB_MAP`. Setup checklist (4-5 objective
  signals, not the brief's full 7 -- two have no clean data signal). Fixed a real
  bug: every module showed "(Zapnuto)" regardless of actual state. Nav: Import
  removed (now a button on the bills page); Rozpočet/Léky a výdej/Dokumenty
  renames. NOT done: Odeslané nav+page (bundled into Part 8), an ORGANIZACE
  "Připojení" item (ambiguous target, skipped), the template catalog with
  Výchozí/Upraveno badges, Přehled akce (optional), most of §5.1's help texts.
- **Part 6** (import) — done. Found & fixed: Part 1's firstName/lastName fixed
  fields were offered as mapping targets but silently dropped in row-building
  (only kind=custom was read). Combined-name column now auto-splits; multiple
  guardian e-mail columns now create multiple guardians instead of one
  garbled concatenated string; diacritics-insensitive duplicate matching +
  DOB disambiguation. NOT done: a full per-row post-import result table.
- **Part 7** (Health module fixes) — done. "Follow-up" strings renamed to
  "Následná kontrola"; incident-form date-outside-event hint (never blocks).
  Participant detail: actions grouped as buttons, "Upravit" merged into one
  link opening the central roster's section editor -- the duplicate inline
  health-notes editor on this page is DELETED (`FieldInput` gained a
  `multiline` prop so its textarea UX isn't lost); "Smazat" moved to a "⋯"
  overflow menu; guardians here now editable in place too (same
  missing-phone gap Part 2 fixed on the roster). Meds grid: "today" falls
  back to the whole event range when today is outside it. Sent-mail log
  gained Typ/Předmět columns (`ParentEmailLog.subject`, additive migration).
- **Part 8 + 11-B** (Mail inbox) — done. Inbox loads on open (was a manual
  click) with newest-first default sort; after processing/deleting a
  message it no longer auto-advances into the next one pre-ticked -- an
  empty state with a short summary instead. Actions only pre-check when a
  participant was actually detected; "Smazat e-mail" is a secondary text
  link, not a second primary button. Detection gained a fallback (11-B.7):
  sender address matched against known guardian e-mails when no name
  matches. Newly-created guardians (on reply) now get a name from the
  sender's "From" header (was always blank) (11-B.8). Reply/bulk-status
  checklist lines: doručeno/chybí wording + spacing fixed; questionnaire-URL
  line now self-omits when unset (`questionnaire_line`, same trick as
  `registration_deadline`). Bulk status dialog lists every active
  participant with its real recipient address(es) or a ⚠ warning, not just
  ones already known-valid. Fixed two more `{count}`-plural bugs
  (`bulkStatusModal.confirmSend`, `composeEmailModal.recipientCount`).
  NOT done: real recipient list in the accept-dialog ComposeEmailModal
  (11-A.4, same idea, different dialog).
- **Part 9 + 11-C/D + 11-G (partial)** — done. Event page shows "Podepsáno
  jako: {name}" under the sender-mailbox control with a link to personal
  settings (Part 7's own per-user settings, already shipped separately).
  Found & fixed (11-C): the roster's document-received counter counted
  ROWS (files), not distinct types — 3 files of the same type pushed a
  participant's count past the event's actual document-type total; now
  keyed by a `participantId -> Set<eventListItemId>` map. New "Dokumenty"
  section (11-D) on the health participant-detail page, grouped by type
  with filename/received-at/received-via/Drive link, backed by
  `GET /api/participants/[id]/documents` (health-or-mail gated, same as
  the rest of this page). 11-G native-file-input fix: the mail compose
  dialog's raw `<input type="file">` (showed the browser's own "Choose
  File / No file chosen") replaced with the same styled-button pattern
  already used by the incident form's photo picker, plus a filename/
  "Žádný soubor nevybrán" line next to it. Also fixed a literal
  `{{proměnných}}` left in stored translation copy (documentVariablesPage
  .intro) — currently an orphaned/unused key, fixed as a precaution.
- **Part 11-G (rest) + 11-H** — done. Překlady page gained a "Jen
  chybějící překlady" checkbox (filters to rows with empty cs or en)
  alongside the existing search box. 11-H: confirmed by code reading, no
  change needed — `currentEventId` lives in the app-wide `I18nProvider`
  (persisted to `localStorage`), not page-local state, and `AppSidebar`
  (which renders the switcher) is mounted once in `providers.tsx` for
  every route — the switcher already persists across Šablony/Překlady.
- **Part 11-F** — done. Incident photo picker: preview/upload area is now
  a fixed-size reserved box with a spinner overlay while uploading (was a
  text-only "Načítání…" line below, layout jumped when the image
  appeared). Body map: marker radius 7px → 11px (easier to see/tap
  again), a "Odebrat značku" button clears the mark (previously the only
  way was re-tapping elsewhere on the silhouette), and an explanatory
  hint line under it (shown only in the editable, non-locked case).
  Incident list rows gained a body-location chip (Přední/Zadní) and a 📷
  marker when a photo is attached (previously invisible without opening
  the row). Temperature field hidden for the "Úraz" (injury) category —
  not applicable there and was cluttering the form.
- **Part 11-A.4** — done. `ComposeEmailModal` (both accept and freeform
  bulk-email modes) now lists each recipient's real resolved contact
  e-mail (or a ⚠ "bez kontaktního e-mailu" warning), fetched from the
  same roster endpoint's `computed.contact_email` already used elsewhere
  -- same idea as the bulk-status dialog's "Příjemci" column, just applied
  to the other send dialog. Kept the existing count line alongside it.
- **Part 10 §3-7 (partial)** — done: `EmailTemplateAdmin` (the shared
  widget already used for all 3 event-scope editable templates --
  registration_acceptance, parent_health_summary,
  mail_helper_bulk_status_update, across the Účastníci/Zdraví/Pošta
  tabs) gained a Výchozí/Upraveno badge next to its label and a
  "Porovnat s organizací" toggle that fetches and shows the org default
  read-only alongside the event's override, via the already-existing
  `/api/email-templates` org route. One shared component, so all 3
  templates got this at once. NOT done: most of §5.1's help-text table,
  Přehled akce landing page (optional per the brief).

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
9. `scripts/fix-stale-default-email-templates.ts --apply`.
10. `prisma migrate deploy` (again) — `ParentEmailLog.subject` (Part 7),
    additive.
11. `scripts/seed-missing-translations.ts` — run again, idempotent.
12. `scripts/update-translations-text-changes.ts --apply` — run again,
    idempotent.
