# Participants / settings / Health / Mail restructure — change notes

Source: "FINAL Claude Code prompt 2 (consolidated)" (Parts 0–11). Precedence
Part 11 > Part 10 > Parts 1–9. Working through the recommended order; this
file is updated as each part lands. Under 150 lines by design — status +
findings only, not a diff log.

## Part 0 — orientation findings

The codebase already has a large chunk of what Parts 1–6 ask for, built in
an earlier session (see the "Unified participant fields..." work):
- `ParticipantFieldSurface` already has `list/health_list/health_detail/
  mail_list/documents/import` (not the old bare `health`/`mail`).
- `EventParticipantField.kind` (`custom/builtin/guardian/computed`) +
  `FIXED_PARTICIPANT_FIELDS` (`src/lib/fixed-participant-fields.ts`) already
  unifies name/DOB/group/guardian fields/price/VS/QR into one registry that
  Part 3's plan called for — so Part 4 is a *simplification* of an existing
  per-surface gate (`allowedParticipantFieldKeys` in `module-access.ts`),
  not new plumbing.
- `resolveVariables` (`src/lib/document-variables.ts`) already resolves
  every active field with the `documents` surface generically — the
  canonical-palette work is renaming/aliasing on top of this, not a new
  resolver.
- Health notes (allergies/meds/chronic/other) are already
  `customFieldValues`, not dedicated columns — Part 3's "merge" is UI/label
  work on an already-merged data model, not a migration.
- `Participant.registrationStatus` and the accept-email plumbing
  (`registration_acceptance` purpose, `ComposeEmailModal`) already exist
  (`docs/registration-workflow.md`).
- NOT yet present: `firstName`/`lastName` split (still one `name` field);
  a `contact_email` computed type (there's a `guardian`-kind `Email` field
  reading `guardians[0]`, not "first guardian with receivesCommunications");
  a leftover custom field literally labelled "Jméno a příjmení dítěte"
  duplicating the builtin `Name` field (Part 1's "remove the duplicate").

## Status

- Part 1 (names, contact e-mail): done. `Participant.firstName/lastName` (additive
  migration `add_participant_name_split`, also adds `ComputedFieldType.contact_email`
  enum value); `src/lib/participant-name.ts` helpers; add/edit forms on the central
  roster now ask for Jméno + Příjmení as two labelled fields; `{{participant_first_name}}`/
  `{{participant_last_name}}` added as new fixed builtin fields (documents+import
  surfaces). The existing `Email` fixed field (label "Kontaktní e-mail") changed from
  kind=guardian (plain `guardians[0].email`) to kind=computed/computedType=contact_email
  (first guardian with `receivesCommunications`, else the first) -- key unchanged so
  `{{Email}}` in existing Google Docs still resolves, just to a better-chosen address;
  `{{contact_email}}` also wired into all three email-send paths (parent summary, bulk
  status, registration/freeform). Roster sort is now by surname, Czech collation.
  Scripts (all dry-run default): `split-participant-names.ts`, `backfill-contact-email-
  field.ts` (updates existing per-event `Email` rows), `deactivate-duplicate-name-
  field.ts` (the leftover custom field literally labelled "Jméno a příjmení dítěte");
  reused `backfill-unified-participant-fields.ts` to push the two new fixed fields onto
  existing events. Removed the "Výjimka: název akce..." hint box from
  `ParticipantFieldAdmin` (Part 1's explicit "keep out of the UI").
  Deferred to Part 5 on purpose: `{{contact_email}}`/`{{participant_first_name}}` etc.
  are NOT yet resolvable in DOCUMENT merge under those exact names (only `{{Email}}`/
  `{{participant_first_name}}` -- the latter already is, since it's a new key with no
  legacy baggage); the full canonical-name-with-legacy-alias layer Part 5 asks for
  will let `{{participant_name}}` resolve in documents too, not just email.
- Part 4 (field visibility by module): done. `allowedParticipantFieldKeys` (module-
  access.ts) now gates by whether the module is ENABLED FOR THE EVENT, not by the
  calling user's own health/mail grant (removed the admin special-case too -- with
  Health off there's no Health screen to show those fields in for anyone, admin
  included). `src/lib/participant-fields.ts` gained `fieldCategory`/`surfacesForCategory`
  (category = Základní/Zdraví/Dokumenty a pošta/Vlastní, derived from kind+surfaces,
  not stored). `ParticipantFieldAdmin.tsx`'s per-surface checkbox grid (5 checkboxes)
  replaced with one category badge + a single "Zobrazit v seznamu účastníků" toggle;
  the "add field" form got a Kategorie select instead. `scripts/normalize-
  participant-field-surfaces.ts` (dry-run) rewrites existing custom fields' surfaces
  to the category's derived defaults. Smoke-tested: a mail-only user sees a
  health-category custom field once Health is enabled for the event, not before.
  Known minor deviation: the "which categories can a NEW field be created as" filter
  in the admin UI still reads `/modules/mine` (grant-based) rather than event-level
  enablement, since the alternative endpoint is bills-access-gated -- cosmetic only,
  the real access control (allowedParticipantFieldKeys) is correct either way.
- Part 2 (working lists): in progress. Health working list (`health/page.tsx`) now
  shows Příjmení Jméno / Skupina / Věk / incident indicator (dot+count, tooltip with
  last date) / med-plan-today dot / "+ Záznam"; dropped the Dokumenty column and the
  dynamic health_list custom-field columns (working list, not a configurable roster).
  New endpoint `GET .../participants/health-signals`. Deviation: "unresolved incidents"
  from the brief isn't representable -- `Incident` has no resolved/closed concept
  anywhere in the schema -- so the indicator is "logged in the last 24h" only.
  Mail working list (`mail/participants/page.tsx`): Příjmení Jméno / Registrace / one
  column per document type / Kontaktní e-mail (new `contactEmail` on the mail
  participants route, via `resolveContactEmail`); dropped Věk and the dynamic
  mail_list custom-field columns. Toggle now writes a `MailActionLog` row
  (`document_marked`/`document_unmarked`, additive migration
  `add_mail_action_document_toggle`) and the click shows a 5s undo toast.
  Central roster (default columns, edit drawer, "Přijmout hned", bulk accept, guardian
  inline edit): not started yet.
- Parts 3, 5–11: pending.

## Deviations / contradictions found

(none yet)

## Deploy order so far (Part 1 only; more scripts land as later parts finish)
1. `prisma migrate deploy` (adds `first_name`/`last_name` columns + the
   `contact_email` enum value -- purely additive, safe before the new code deploys).
2. `scripts/backfill-unified-participant-fields.ts` (adds the 2 new fixed fields to
   every event; safe to re-run).
3. `scripts/backfill-contact-email-field.ts --apply` (do this BEFORE the new code
   serves traffic -- until it runs, existing events' `Email` field is still
   kind=guardian in the DB while the new code expects kind=computed for the smart
   resolution; the old kind still resolves, just without the receivesCommunications
   preference, so this is a quality gap, not a crash, if delayed).
4. `scripts/split-participant-names.ts --apply` (review the printed ambiguous list
   by hand afterwards).
5. `scripts/deactivate-duplicate-name-field.ts --apply`.
6. `scripts/seed-missing-translations.ts`.
