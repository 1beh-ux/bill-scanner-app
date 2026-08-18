# Camp/Event Platform — Health & Parent Communication Module (Draft v1)

Status: draft, decisions confirmed in discussion, pending schema/build review. This
module extends the app currently called "Bill Scanner V2" — as the platform grows
beyond bills, "camp/event management platform" is the more accurate frame, with
Bills, Health, and (future) Mail Helper as modules sharing one foundation.

Source: ported and redesigned from a working Google Apps Script app ("Camp Medical
Log"), which used a Sheet as its database. This doc keeps the functionality, rebuilds
the data model on Postgres/Prisma, and integrates it with the existing platform
(events, auth, GCS, Drive export).

---

## Confirmed decisions

1. **Incident edit model:** snapshot-per-edit (Option A) — an edit writes a full new
   row with the complete new state, not a field-level diff. "Current" state = latest
   edit overlaid on the base row. `void` = soft delete, filtered from all reads. Kept
   as-is from the Apps Script version; no reason to conform to `bill_audit_log`'s
   diff style at this data volume.
2. **Module access:** binary per-event grant (`user_event_module_access`), no
   internal role tiering within Health for v1. Accountant's "all events" shortcut
   (bills-specific) does **not** extend to Health — every grant is explicit.
3. **Templates (meds + situations):** same org-default → per-event-editable-copy
   pattern as `category_templates` → `event_categories`. This is now a deliberate,
   repeated platform pattern, not a one-off.
4. **Participants are event-scoped**, not shared across events — a returning child
   gets a new `participant_id` each event. Simpler than `authors`: a direct `event_id`
   FK, no join table needed.
5. **Guardians:** a participant can have multiple guardians, each with their own
   email — not a single field on the participant.
6. **PDF delivery:** attached directly to the email, not a Drive share link. Avoids
   managing per-file sharing permissions for people outside the org's Google domain.
7. **Parent-facing email language:** Czech-only for now. `email_templates` doesn't
   need the `cs`/`en` split that the UI `translations` table has.
8. **Parent-facing email sending is in scope now**, not deferred to a future Mail
   Helper module — with a dedicated admin page for template/variable editing,
   separate from the actual sendout action.

---

## Shared platform additions

### participants

Event-scoped roster, shared foundation for Health (and future Mail Helper).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | Direct FK — no join table (see decision 4) |
| name | string | |
| group_name | string, nullable | |
| active | boolean | |
| allergies | text, nullable | Structured, not one free-text blob — ported as-is |
| meds_notes | text, nullable | |
| chronic_issues | text, nullable | |
| other_notes | text, nullable | |
| created_at | timestamp | |

### participant_guardians

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| participant_id | uuid FK → participants | |
| name | string, nullable | Not supplied by import (see below) — fillable later if wanted |
| email | string | |
| relationship | string, nullable | e.g. "matka", "otec", "zákonný zástupce" |
| receives_communications | boolean, default true | Per-guardian opt-out without deleting the record |

### Participant import

Two mechanisms, funneling into the same review-and-commit step:

1. **Paste import (build first).** A textarea/grid accepts tab-separated data
   copied directly from the org's existing Google Sheet — select the range,
   copy, paste. First row treated as headers, auto-matched to fields where
   possible: participant name, group, the four note fields, and **one**
   guardian-email column (the source sheet has a single contact column,
   email-only — no guardian name to import, so `participant_guardians.name`
   stays blank on import and can be filled in manually later if it matters).
   User confirms or corrects the column mapping, reviews a preview table
   (flagging rows with a missing participant name or malformed email), then
   commits as a batch. No new infrastructure — this is a client-side parse
   feeding the same `participants` + `participant_guardians` creation logic
   the manual add form uses. Mirrors the existing bulk-review-table pattern
   from bills import.
2. **Live Google Sheets import (planned, once the above is proven out).** Same
   mapping/preview/commit step, sourced from the Sheets API instead of the
   clipboard — admin pastes a Sheet URL/ID instead of pasting cells. Reuses the
   existing `bill-scanner-drive` service account, which already has Sheets API
   access (it generates the export manifest today) — this just needs read
   scope added, not a new identity. Worth scoping the delegation carefully: the
   SA should only read a Sheet an admin explicitly points it at by URL, not
   have standing browse access to the org's Drive.

Building the paste importer properly (mapping + preview + validation) means the
Sheets version is mostly a different data source feeding the same pipe, not a
second implementation.

### Module registry & access

| Table | Fields | Notes |
|---|---|---|
| modules | id, key (`bills`\|`health`\|`mail`), name | Registry |
| event_modules | event_id FK, module_key, enabled | Which modules are switched on per event |
| user_event_module_access | user_id FK, event_id FK, module_key | Binary grant (decision 2) |

**Bills becomes a module too (confirmed).** Originally Bills was the
always-on default, gated only by the existing `user_event_access` table, with
Health as the only thing going through the new module system — an asymmetry
that would've meant a health-only volunteer still saw the Bills nav item with
no way to hide it. Resolved: Bills joins the registry as a normal module, and
`user_event_access` is retired in favor of `user_event_module_access` — that
table was already functionally "who manages Bills for this event," just under
an older name from before modules existed.

- **Migration:** every existing `user_event_access(user_id, event_id)` row
  becomes a `user_event_module_access` row with `module_key = 'bills'`. Every
  existing event gets an `event_modules` row with `bills.enabled = true`.
  Lossless — nobody's access changes on day one.
- **Accountant shortcut preserved, re-scoped.** The original rule
  ("accountants skip the access table, role implies access to all events")
  becomes "role = accountant implies an implicit `bills` grant for every
  event, no row needed." It does **not** extend to Health — that stays an
  explicit per-event grant, as already decided.
- **This changes the core schema, not just Health's.** The real
  `bill-scanner-v2-data-schema.md`'s `user_event_access` section will need
  the same update when this actually gets built — flagging it here since I
  can only edit the drafts in this project's output, not that file directly.

---

## Health module schema

### incidents

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| participant_id | uuid FK → participants | |
| created_at | timestamp | |
| created_by_user_id | uuid FK → users | |
| category | enum (`illness`,`injury`,`parasite`,`medication`,`other`) | |
| template_type | string, nullable | FK-by-key to situation template used, if any |
| action_summary | string | |
| pill_name | string, nullable | |
| details | text | |
| photo_gcs_path | string, nullable | GCS, not Drive — see Infrastructure below |
| parent_incident_id | uuid FK → incidents, nullable | Self-referencing, for follow-ups |
| temp_c | decimal, nullable | |
| body_view | enum (`front`,`back`), nullable | |
| body_x_pct | decimal, nullable | |
| body_y_pct | decimal, nullable | |

No `status` field — the original sheet's version was vestigial (confirmed dropped).
Void is handled entirely via `incident_updates.update_type = 'void'`.

### incident_updates

Append-only, full-snapshot edits (decision 1).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| incident_id | uuid FK → incidents | |
| updated_at | timestamp | |
| updated_by_user_id | uuid FK → users | |
| update_type | enum (`correct`,`void`) | |
| action_summary, pill_name, details, photo_gcs_path, temp_c, body_view, body_x_pct, body_y_pct | (same types as incidents) | Full new state, not a diff |
| note | text, nullable | Optional note on why this update was made |

### Meds time slots (template → per-event copy — item 1 resolved)

Originally a hardcoded four-value string in the source app. Formalized as its
own templated list, same shape as everything else here.

| Table | Fields | Notes |
|---|---|---|
| slot_templates | id, name, sort_order | Org-wide defaults — e.g. ráno / po obědě / po večeři / před spaním |
| event_slots | id, event_id FK, name, sort_order, is_from_template | Per-event editable copy |

### Meds (template → per-event copy, decision 3)

| Table | Fields | Notes |
|---|---|---|
| med_templates | id, name | Org-wide defaults |
| event_meds | id, event_id FK, name, is_from_template | Per-event editable copy |
| participant_med_plans | id, participant_id FK, event_med_id FK, event_slot_id FK, dose, notes, active | Standing scheduled dosing |
| med_checklist | id, participant_id FK, event_med_id FK, event_slot_id FK, date, given, given_at, given_by_user_id | Daily execution log. Unique on (participant_id, event_med_id, event_slot_id, date) |

### Situation templates (template → per-event copy, decision 3)

| Table | Fields | Notes |
|---|---|---|
| situation_templates | id, key, button_label, category, short_description, default_med, default_temp, default_details, active | Org-wide |
| event_situation_templates | id, event_id FK, key, button_label, category, short_description, default_med, default_temp, default_details, is_from_template | Per-event override |

**Build note:** this is now the fourth table pair following the identical
org-default → per-event-copy shape (`category_templates`, `med_templates`,
`situation_templates`, `slot_templates`). Worth implementing as one generic
mechanism — a `list_templates` / `event_list_items` pair with a `kind`
discriminator column — rather than four near-duplicate CRUD scaffolds. Same
data shape, same admin UI, same import/edit logic; no reason to hand-write it
four times over.

---

## Parent communication schema

### email_templates (template → per-event copy, same pattern)

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| purpose_key | string | Single fixed value: `parent_health_summary`. Not a shared, extensible set with Mail Helper — that module will define its own templates independently if/when it's built. |
| subject | string | Supports `{{variable}}` placeholders |
| body | text | Supports `{{variable}}` placeholders |
| active | boolean | |

| Table | Fields | Notes |
|---|---|---|
| event_email_templates | id, event_id FK, purpose_key, subject, body, is_from_template | Per-event override, optional — falls back to org default if none |

Variables resolved at send time: `{{child_name}}`, `{{camp_name}}`, `{{date_range}}`,
`{{sender_name}}`. Admin page: subject/body editor, a variable-insertion palette, and
a preview with dummy data before anything is live.

### parent_email_log

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| participant_id | uuid FK → participants | |
| guardian_id | uuid FK → participant_guardians | |
| purpose_key | string | Which template was used |
| sent_at | timestamp | |
| status | enum (`sent`,`failed`) | |
| error_message | text, nullable | |
| sent_by_user_id | uuid FK → users | |
| pdf_gcs_path | string, nullable | The attachment that was sent, for the record |

Send flow (single participant, or bulk across an event) follows the existing
bulk-approve/bulk-AI pattern: **per-recipient failure isolation** — one bad address
doesn't block the batch.

---

## Infrastructure additions

- **Photos:** drop the Apps Script version's per-camp Drive-subfolder + orphan-cleanup
  script. Reuse the GCS + content-hash dedup pipeline already built for bills — same
  lifecycle, no separate cleanup job to maintain.
- **Body silhouettes:** the two front/back reference images become static assets
  bundled with the app, not Drive files fetched at runtime.
- **PDF generation (new):** the existing `print_child`/`print_meds` HTML/CSS templates
  are good as-is for this layout (structured header, body map with dynamic markers,
  threaded timeline) — `pdf-lib` is the wrong tool for this shape of document. Add a
  small headless-browser-to-PDF Cloud Run service (Puppeteer/Playwright + Chromium):
  render the HTML, print to PDF bytes, save to GCS, and also push to the event's Drive
  export folder for the org's own archive (separate from the emailed copy).
- **Email sending (new):** a **separate** service account (`bill-scanner-mail@...`,
  distinct from `bill-scanner-drive@...` — least-privilege, not bolted onto the Drive
  SA's scopes) using domain-wide delegation, impersonating a **fixed functional
  mailbox** (e.g. `zdravotnik@zare.cz`) rather than whichever admin triggers the send.
  Keeps replies in one monitored inbox and sets the identity pattern Mail Helper will
  reuse later — this doubles as the answer to the open "whose Drive/Gmail" question
  from Milestone 4.

---

## Resolved

- `status` on `incidents`: dropped, no replacement needed.
- `email_templates.purpose_key`: single fixed value (`parent_health_summary`) for
  this module. No shared purpose set with a future Mail Helper module.
- Admin-detection: not needed. `user_event_module_access` (binary per-event grant)
  fully replaces the unfinished `is_admin_`/`isAdmin_` concept — no separate
  "can edit others' entries" tier within Health.
- Meds time slots: not fixed platform-wide — standard org defaults, editable
  per event, same `slot_templates` → `event_slots` shape as everything else.
- "Stáhnout PDF" (download without sending) confirmed as a distinct action from
  the email flow, alongside the Drive-saved copy.
- Participant import: paste-from-clipboard first, live Google Sheets connection
  planned as a follow-on using the same review step and the existing Drive
  service account's Sheets access.
- Guardian import shape: the source sheet has exactly one contact column,
  email-only — always a single guardian, no name. `participant_guardians.name`
  is nullable and left blank on import; the multi-guardian schema (decision 5)
  stays in place for manual entry, it just isn't what the import path uses.

## Open items

- Exact Sheets API read scope for the live-import follow-on — confirm whether
  the existing `bill-scanner-drive` SA's delegation already covers arbitrary
  Sheet reads, or needs a scope addition, when that phase is actually built.
