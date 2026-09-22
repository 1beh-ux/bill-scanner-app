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

## Status
- **Part 1** (names, contact e-mail) — done. `firstName`/`lastName` split
  (`Participant`, migration `add_participant_name_split`); `Email` fixed
  field is now `computed`/`contact_email` (first guardian with
  `receivesCommunications`, else first) instead of plain `guardians[0]`,
  key unchanged so `{{Email}}` still resolves in existing docs. Scripts:
  `split-participant-names`, `backfill-contact-email-field`,
  `deactivate-duplicate-name-field` (all dry-run). Deferred to Part 5:
  full canonical-name/alias resolution for documents (email already has
  `contact_email`/`participant_first_name`/`participant_last_name`).
- **Part 4** (field visibility by module) — done. `allowedParticipantFieldKeys`
  now gates by whether the module is enabled for the EVENT, not the
  caller's own grant. `fieldCategory`/`surfacesForCategory` (Základní/
  Zdraví/Dokumenty a pošta/Vlastní) replace the 5-checkbox surface grid in
  `ParticipantFieldAdmin` with one category + a "show in list" toggle.
  Script: `normalize-participant-field-surfaces` (dry-run). Minor known
  deviation: the admin UI's "which categories to offer for a new field"
  filter still reads grant-based `/modules/mine`, not event enablement —
  cosmetic only, real enforcement is correct.
- **Part 2** (working lists + central roster) — done. Health list: Příjmení
  Jméno/Skupina/Věk/incident dot (last-24h, tooltip)/med-plan dot/
  "+ Záznam"; dropped Dokumenty + dynamic columns. New route
  `.../participants/health-signals`. Deviation: "unresolved incidents" not
  representable (no resolved/closed concept anywhere in the schema) — dot
  is "logged in the last 24h" only. Mail list: Příjmení Jméno/Registrace/
  doc-type columns/Kontaktní e-mail; dropped Věk + dynamic columns; the
  manual doc toggle now logs `MailActionLog` (`document_marked`/
  `document_unmarked`, migration `add_mail_action_document_toggle`) with a
  5s undo toast. Central roster: fixed columns now Příjmení/Jméno (split)/
  Skupina/Věk/Registrace/Dokumenty/Kontaktní e-mail; edit modal grouped
  into Základní údaje/Zákonní zástupci/Údaje/Zdravotní poznámky; guardians
  now genuinely editable (name/e-mail/relationship/phone/"dostává
  e-maily") with per-row save. Found & fixed two real gaps: guardian POST/
  PATCH/DELETE routes were health-only (blocked mail-only users, widened
  to health-or-mail); guardian PATCH silently dropped `phone`. "Přijmout
  hned" checkbox on add (no registration number assigned yet, deferred
  like the existing accept flow). Bulk accept from toolbar already
  existed. Editable "Věk": never existed, brief already satisfied. Script:
  `fix-tshirt-size-casing` (dry-run, production data not a seed default).
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
- **Parts 5–11**: pending.

## Deploy order so far (grows as later parts land)
1. `prisma migrate deploy` — additive only (name split + contact_email enum
   value, MailActionType document_marked/unmarked).
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
9. `scripts/seed-missing-translations.ts`.
10. `scripts/update-translations-text-changes.ts --apply`.
