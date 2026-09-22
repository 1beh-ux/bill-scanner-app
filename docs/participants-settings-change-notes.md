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
  (only kind=custom was read). Combined-name column now auto-splits (same rule
  as the Part 1 script, extracted to `participant-name.ts`). Multiple guardian
  e-mail columns now create multiple guardians instead of one garbled
  concatenated string. Diacritics-insensitive duplicate matching + DOB
  disambiguation. NOT done: a full per-row post-import result table (the
  aggregate summary + live preview table already cover most of that ground).
- **Part 7** (Health module fixes) — done. All 7 "Follow-up" strings renamed to
  "Následná kontrola"; "Zobrazit podrobnosti…" -> "Zdravotní poznámky dítěte";
  incident-form date-outside-event hint (never blocks). Participant detail:
  actions grouped as buttons; "Upravit údaje"/"Upravit poznámky" merged into
  one "Upravit" that opens the central roster's section editor -- the
  duplicate inline health-notes editor on this page is DELETED (`FieldInput`
  gained a `multiline` prop so its nicer textarea isn't lost); "Smazat" moved
  to a "⋯" overflow menu; "Otevřít složku na Disku" only shows when the
  event actually has a participants/export root folder configured; guardians
  here are now editable in place too (found the same missing-phone gap Part
  2 fixed on the roster). Meds grid: "today" falls back to the whole event
  range when today is outside it (was clamping to one boundary day), with an
  info banner explaining why; export controls got visible labels. Sent-mail
  log (`ParentEmailLogTable`, already shared by 2 pages) gained Typ/Předmět
  columns (`ParentEmailLog.subject`, additive migration, wired into all 9
  log-creation call sites). Already satisfied: meds grid scroll+sticky column
  (the rotated slot labels are a separate, coexisting detail).
- **Part 8 + 11-B** (Mail inbox) — done. Inbox now loads on open (was a manual
  "Načíst e-maily" click); default sort newest-first ("Od nejstarších" is the
  alternative). After processing/deleting one message, the next one is no
  longer auto-opened with its actions pre-ticked -- an empty state with a
  short success summary instead, and a deliberate pick for what's next.
  Message detail: participant-dependent actions (save attachments/reply/
  update status) only pre-check when a participant was actually detected;
  "Provést vybrané akce" is disabled until a participant is picked or only
  "Přesunout e-mail" is requested; "Smazat e-mail" is a secondary text
  action next to the primary button, not a second primary-looking one.
  Detection gained a fallback (11-B.7): when no name matches, check whether
  the sender's address belongs to a known guardian and suggest that child
  ("Odesílatel je zákonný zástupce: X"). Per-attachment child select now
  falls back to (and displays) the top-level participant instead of showing
  empty while silently using it anyway; its document-type dropdown offers
  every active type, not just ones with a filenameSuffix configured (that's
  only for the auto-guess, not eligibility). Guardian dedup on reply
  (11-B.8) already matched case-insensitively by e-mail; the real gap was a
  newly-created guardian never getting a name -- now uses the sender's "From"
  display name. Reply/bulk-status checklist lines (shared renderer): dropped
  the trailing comma, added the word next to the icon ("✔ Přihláška —
  doručeno"), and the closing now always has a blank line before it (was
  only when a note/questionnaire link happened to supply one). Questionnaire
  URL line now genuinely omits itself when unset (new `questionnaire_line`
  clause variable, same trick as `registration_deadline`). Bulk status
  dialog: now lists every active participant (not just ones with a valid
  recipient), shows each row's recipient address(es) or a ⚠ warning, and
  only preselects rows that are both incomplete AND have one. Script
  `fix-registration-acceptance-template.ts` renamed/generalized to
  `fix-stale-default-email-templates.ts` (now covers both rewritten
  defaults). Fixed two more of the `{count}` Czech-plural bugs
  (`bulkStatusModal.confirmSend`, `composeEmailModal.recipientCount`).
  NOT done: showing real (not dummy) recipient addresses in the
  registration-accept ComposeEmailModal specifically (11-A.4) -- same idea
  as the bulk-status fix above, not yet built there; "syntactically valid
  e-mail" isn't separately validated beyond the existing regex check already
  used elsewhere.
- **Part 9, 10 §3-7, 11 A/C/D/F/G/H**: pending.

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
10. `scripts/seed-missing-translations.ts`.
11. `scripts/update-translations-text-changes.ts --apply`.
