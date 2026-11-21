# Fields Manager — release plan

Date: 2026-11-21. Implements `design.md`. Each phase ships alone, on its own branch, through staging, then to
production with the organization flag **off**; it can be reverted alone. Phases 0–6 are strictly additive; only
phase 7 removes or merges anything.

## Common procedure (every phase)

**Branch:** `fields-<n>-<name>` from `master`. Pushing deploys to staging automatically (trigger `staging-deploy`);
the staging build runs `prisma migrate deploy` on the staging DB and all translation scripts. Start the staging DB
first (`gcloud sql instances patch bill-scanner-staging-db --activation-policy=ALWAYS`), stop it after.

**Migration rehearsal on staging:** before pushing, run `prisma migrate diff` to read the SQL; after the staging
build, confirm `prisma migrate status` = up to date and run the phase's checks. For a phase with a data backfill,
run the backfill script on staging twice (it must be idempotent: second run changes 0 rows).

**Tests:**
- *Automated in the repo* = `src/lib/*.check.ts` self-checks (`npx tsx src/lib/x.check.ts`, `node:assert`, invented
  data, no DB), the same pattern as `participant-sync.check.ts`. Each phase lists its new checks. Plus `npx tsc
  --noEmit` and `npx eslint` on touched files.
- *Manual on staging* = the listed clicks on `https://bill-scanner-app-staging-1050716617948.europe-west3.run.app`
  with the invented organisation "Testovací oddíl (STAGING)" and the test Drive folder.

**Release to production:** merge to `master`; backup first (`gcloud sql backups create --instance=bill-scanner-db
--description="before fields-<n>"`), note the current revision, `bash ~/claude-helpers/deploy.sh`, smoke test
(sign in, open an event, generate one document on a test event). Flag stays off for Záře until the phase's "go".

**Rollback:** code — `gcloud run services update-traffic bill-scanner-app --to-revisions=<previous>=100`.
Database — every phase 0–6 migration only adds; the old code ignores new tables/columns/enum values, so a code
rollback is enough. Phase 7 has its own undo (below). Runbook: `docs/staging/release-runbook.md`.

**Golden documents** (used from phase 1 on): on staging, for the 2027 camp's two test templates and three invented
participants (a child with one guardian, a child with two guardians, a child whose guardian has no e-mail), export
the merged PDFs' text and keep it as fixtures in `scripts/fields/golden/*.txt`. Every later phase must reproduce them
byte-for-byte with the flag off, and with the flag on unless the phase says what changes.

---

## Phase 0 — additive model + flag (`fields-0-model`)

- **Files:** `prisma/schema.prisma`, one migration, `src/lib/org-features.ts` (`hasFeature(org, "fields_manager")`),
  `scripts/fields/seed-legacy-aliases.ts` (guardian legacy aliases: `zast_jmeno`, `zak_zast_jmeno`, `vztah`,
  `zast_telefon` → `guardian1_*`), staging seed extension (consent and multi fields, a second guardian).
- **DB change (additive):** enum values (`longtext`, `multi`, `consent`, `email`, `phone`, `calculated`), enum
  `FieldStorage`, `AliasTarget`; columns `Organization.features/guardianSlots/guardianProps`,
  `ParticipantFieldTemplate.storage/section`, `ChildGuardian.position/extra`, `ParticipantGuardian.position/extra`;
  tables `field_aliases`, `event_variables`, `sync_review_items`, `import_runs`, `document_edits`, `field_change_log`.
- **No behaviour change:** nothing reads the new columns yet; all defaults equal today (`storage = profile`).
- **Automated:** `org-features.check.ts`.
- **Staging:** migration applies; the app works exactly as before (sign in, roster, a document preview, the import
  page, the portal of an invented family, the public form `/r/staging-tabor-2027`); legacy-alias seed run twice = 0 changes the second time.
- **Go:** production migrate status up to date, smoke test passes, no error logs for 24 h.

## Phase 1 — resolver, read-only (`fields-1-resolver`)

- **Files:** `src/lib/field-resolver.ts` (registry + `resolveKey`/`resolveAll`), `src/lib/field-calc.ts`
  (CalcSpec evaluator, composite read as join/template), `src/lib/event-variables.ts` (one registry for linked,
  calculated and free variables; aliases `org_name`→`organization_name`, `event_name`→`camp_name`, …),
  `document-variables.ts` and `template-check.ts` call the resolver **only when the flag is on**.
- **DB change:** none.
- **Automated:** `field-resolver.check.ts` (every kind, alias one-hop, cycle guard, unresolved), `field-calc.check.ts`
  (join with each separator, template, age at event start, if-then-else, builtins), `event-variables.check.ts`
  (registry ⊇ today's `EVENT_KEYS` and `VARIABLES_BY_PURPOSE` keys).
- **Staging:** flag on for the staging organisation → golden documents identical; template check identical
  statuses; e-mail preview identical. Flag off → identical too.
- **Go:** golden documents byte-identical with flag on and off.
- **Done 2026-11-21 (staging):** `scripts/fields/compare-resolver.ts` — 110 variable sets (55 registrations ×
  documents/e-mail), 3,355 existing keys compared flag off vs on, **0 differences**; with the flag on only new keys
  appear (linked event variables, ticket aliases, `org_name`, `guardianN_*`). Found: the real send and the preview load
  only guardians with "receives e-mail" on, so `guardianN_*` in documents counts only those — phase 3 must load all
  guardians for slot keys (the legacy fixed keys keep today's rule).

## Phase 2 — read-only screens + field card (`fields-2-screens`)

- **Files:** `src/app/fields/**` (Overview, Fields list read-only, Where it is used read-only, Data read-only),
  `src/components/fields/*` (`FieldsOverview`, `FieldCard`, `UsageMatrix`), `/api/fields/graph`, `/api/fields`,
  `/api/fields/[key]/card`, `/api/fields/[key]/usage`, translations script `scripts/seed-fields-manager-i18n.ts`
  (cs + en, appended to `scripts/staging/translation-scripts.txt` and the production seed list), `FieldCard` hooks in
  roster headers, health, mail, documents list.
- **DB change:** none.
- **Automated:** `fields-graph.check.ts` (edges from invented fields/syncs/templates), `fields-usage.check.ts`.
- **Staging:** overview shows the invented syncs, fields (calculated dashed) and uses; clicking a field lights only
  its path; calculated shows orange dependencies; counts match the seed (`scripts/staging/check-counts.ts`); field
  card opens from roster, health and documents list. Flag off: no `/fields`, no cards.
- **Go:** Záře admins can turn the flag on in production and look (read-only) — first real feedback.

## Phase 3 — fields editor, guardians, event variables (`fields-3-editor`)

- **Files:** `FieldEditor`, `TypePicker`, `CalculatedEditor`, `GuardianSettings`, `EventVariableEditor`,
  `RenameDialog` (preview + confirmation, renames the template and all event copies, design §6a), `src/lib/field-write-targets.ts` (decision A; `routeAnswers` calls it),
  `/api/fields` POST/PATCH, `/api/fields/[key]/rename` (alias mode only in this phase), `/api/fields/guardians`,
  `/api/events/[id]/variables*`, `FieldChangeLog` writes + undo; `createEventWithDefaults` /
  `syncParticipantFieldsForEvent` copy the required default **when the flag is on** (decision B); new field types
  in the portal and public form renderers (`longtext`, `multi`, `consent`, `email`, `phone`).
- **DB change:** none (uses phase 0 tables). Rename moves stored values of the renamed key (as the event rename does
  today) and writes an alias + a `FieldChangeLog` row with the full before/after, so it is undoable; nothing is deleted.
- **Automated:** `field-write-targets.check.ts` (every field × source × portalAccess × override; equals
  `routeAnswers` today for all `storage = profile` templates), `field-rename.check.ts` (alias uniqueness rules),
  `guardian-keys.check.ts` (1–6 slots, legacy aliases, receives-e-mail → contact e-mail).
- **Staging:** create each type; calculated join with every separator; rename a template used in two events → the
  confirmation lists both events, the values and the test template; after confirming, both event copies have the new
  key, values moved, undo restores everything; rename a field used by a test template →
  document still renders via alias (golden documents unchanged); 2 → 4 guardian slots, `guardian2_phone` resolves;
  free event variable `place` printed by a test template; new event copies required defaults; portal shows new types.
- **Go:** golden documents unchanged; all checks green; one week of Záře admins using it on production behind the flag.

## Phase 4 — import wizard (`fields-4-import`)

- **Files:** `src/app/fields/import/**`, `ImportWizard` + steps, `participant-sync.ts` (slot guardians, `valueMap`,
  `policy`, `mergeInto` — old settings read unchanged), `participant-sync-run.ts` (writes via `writeTargets`,
  records `ImportRun`), `/api/events/[id]/imports/*` incl. undo.
- **DB change:** none (connection JSON gains optional keys; old ones read as before). Connection fix-up, done in the
  wizard by an admin (not a script): the "Tábor 2026 – official" mapping's three address columns → the three split
  keys (they all point to `adresa` today, which becomes calculated). The `Email` mappings stay (import-target alias).
  Regression check: the "Platby" connection still matches by `var_symb`.
- **Automated:** extend `participant-sync.check.ts` (old mappings plan identically; slot guardians; value
  translation; policy precedence all → category → person → cell; `mergeInto`), `import-undo.check.ts`.
- **Import replay:** the three invented test sheets on staging (clean, duplicates, bad rows) plus an invented copy of
  last year's column layout (headers only, invented rows): the old import page and the wizard (with the same choices)
  must produce identical registrations; then undo restores counts exactly.
- **Staging:** new field from a column (type guessed, options prefilled); value translation with context rows; "merge
  into" another person; guardian without e-mail reported; profile fields written to the profile only when the
  field's storage is profile.
- **Go:** replay identical, undo exact, no profile writes when flag off.

## Phase 5 — saved connections + review queue (`fields-5-review`)

- **Files:** schedule choice in the wizard, `runSavedSync` → queue uncertain rows as `SyncReviewItem`,
  review screen in the manager + counter on the event, resolve/dismiss/"always do this" APIs.
- **DB change:** none (uses `sync_review_items`).
- **Automated:** `sync-review.check.ts` (which rows queue; idempotent upsert; resolve applies via `writeTargets`).
- **Staging:** save the duplicates sheet as an hourly connection; trigger `/api/cron/participant-sync` with the
  staging cron secret; possible matches and changed values appear in the queue; a second admin resolves one; a
  re-run doesn't duplicate items. (30-minute interval only if Q13 says so.)
- **Go:** a week of automatic runs on staging without duplicate items or unexpected writes.

## Phase 6 — document editor (`fields-6-documents`)

- **Files:** `TemplateViewer`, `VariablePanel`, `PendingEdits`, `/api/events/[id]/documents/[docTypeId]/template`,
  `…/edits*`, shared-template copy.
- **DB change:** none (uses `document_edits`).
- **Automated:** `doc-edits.check.ts` (request building: replaceAllText, ranged edits in descending order, typed-text
  detection, split-placeholder detection on invented Docs JSON fixtures).
- **Staging:** on the test Docs in the test Drive folder only: rename via alias then "update all old names" → one
  batchUpdate, revision guard (edit the Doc in Google meanwhile → conflict handled), a placeholder split by bold
  formatting gets replaced, a placeholder across two paragraphs is shown red, shared template → "save as copy".
  Golden documents regenerated with the edited template = same output as with the alias.
- **Go:** no edit ever touches a Doc the user didn't save; conflicts never overwrite.

## Phase 7 — clean-up and merges (`fields-7-cleanup`) — the only destructive phase

- **Files:** `DuplicatesPanel`, `/api/fields/merge`, "convert alias to direct", delete of inactive merged fields,
  `scripts/fields/snapshot.ts` and `scripts/fields/undo.ts`.
- **DB change:** data only (values moved, fields deactivated then optionally deleted); no schema removal.
- **Before anything:** Cloud SQL backup **and** an application snapshot (`FieldChangeLog.before` with every affected
  template, event copy, value, config and mapping) — the undo record. Undo replays `before`.
- **Automated:** `field-merge.check.ts` (value moving rules, conflicts kept in the log, alias vs direct, config and
  mapping rewrite), `field-undo.check.ts` (merge + undo = identical state).
- **Staging:** merge each invented duplicate group both ways; golden documents with alias mode unchanged; with direct
  mode, pending Doc edits listed and, once saved, golden output unchanged; undo restores everything.
- **Production:** done group by group by an admin in the manager (not by a script), each after its own backup.
  Agreed: allergies, chronic illness, medication merge; the split address stays stored and `adresa` becomes
  calculated; no merge in the membership group.
- **Rollback:** undo from the change log; if that fails, restore the backup taken before the merge.

---

## Overview

| Phase | Branch | DB | Flag-off behaviour change | Can revert alone |
|---|---|---|---|---|
| 0 | `fields-0-model` | additive schema | none | yes (code); schema stays, unused |
| 1 | `fields-1-resolver` | none | none | yes |
| 2 | `fields-2-screens` | none | none | yes |
| 3 | `fields-3-editor` | none (rows in new tables) | none | yes; aliases/variables stay, unused |
| 4 | `fields-4-import` | none | none (old import page unchanged) | yes; `ImportRun` rows stay |
| 5 | `fields-5-review` | none | none | yes; queue rows stay |
| 6 | `fields-6-documents` | none | none | yes; pending edits stay unsent |
| 7 | `fields-7-cleanup` | data | n/a (flag on, admin action) | via undo record / backup |

Rough size: phases 0–2 small to medium, 3–4 large, 5–6 medium, 7 medium. Phases 4 and 6 are independent of each
other and could swap order.
