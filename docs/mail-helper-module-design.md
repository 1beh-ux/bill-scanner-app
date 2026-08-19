# Mail Helper Module — Design Draft v1

Status: draft, decisions confirmed in discussion, pending schema/build review. Third
module on the camp/event platform, alongside Bills and Health — ported from a working
Google Apps Script tool ("Camp Mail Helper") that ran against one shared Gmail inbox
(`executeAs: USER_DEPLOYING`) and a Sheets-based children roster kept in a separate
spreadsheet per event.

---

## Confirmed decisions

1. **Shared roster.** `Participant`/`ParticipantGuardian` (from Health) is the single
   source of truth — no separate Children table. Mail Helper becomes a third real
   consumer of `Participant`, reinforcing it as a platform-level entity, not
   Health-owned.
2. **DocumentTypes: org-default → per-event copy**, implemented as a fourth `kind`
   (`document`) on the existing `ListTemplate`/`EventListItem` mechanism already built
   for meds/slots/situations. No new registry tables — the generalization work in
   Health pays off directly here.
3. **Mailbox identity** reuses the `MailSenderAccount` OAuth connection built for
   Health's sending, with broadened scope for reading and archiving. Not a shared
   institutional inbox in the technical sense — whichever real Gmail account is
   connected for an event is the one Mail Helper reads and sends from, same as
   Health's `Event.senderEmail`. A shared feel is preserved as long as that connected
   account is itself a functional/role mailbox rather than a personal one — that's an
   org choice, not a technical constraint.
4. **Send/log infrastructure reused; templating split.** The bulk status-update email
   fits the existing `{{variable}}` `EmailTemplate` model as a new purpose key. The
   per-email reply does **not** — it's a dynamic loop over document types with
   conditional lines (first-time application, questionnaire link) and a live-edited
   free-text note, regenerated as the volunteer changes selections. That stays
   purpose-built generation logic (mirroring the old `buildSingleReplyTextCz_`),
   routed through the same send-plus-log plumbing as everything else.
5. **`Role` field on Users: dropped.** Present in the old sheet, never actually read
   anywhere in the code — same situation as `Incident.status` before that was
   dropped. Superseded by the platform's `user_event_module_access` system.
6. **Documents: GCS-primary, Drive-mirrored.** Same content-hash pipeline as
   Bills/Health for the working copy. A nightly sync plus an on-demand trigger push
   to Drive for non-technical browsing. **One-way only** — Drive is never the source
   of truth and never read back from.
7. **Google Sheets sync scoped now as read-only live export.** The app periodically
   writes a status snapshot to a Sheet for people who don't use the app directly —
   not an import, not two-way. Generalizes the same underlying need as Health's
   deferred "live Sheets import," but in the opposite direction and deliberately
   narrower for this pass.

---

## Schema

### Document types (fourth `ListTemplateKind`)

| Change | Notes |
|---|---|
| `ListTemplateKind` enum | add `document` alongside `med` / `slot` / `situation` |
| `EventListItem.data` (Json) for `kind = document` | `{ displayName, expectedValue, filenameSuffix }` — no `columnName`; that concept is obsolete once status lives in a relational table instead of dynamic spreadsheet columns |

Reuses the existing `ListTemplateAdmin` component as-is for both org-wide and
per-event management — just a new tab, no new UI code.

### ParticipantDocument

The received-document record. Row existence = received; no row = missing — cleaner
than the old sheet's per-type Yes/No columns.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| participant_id | uuid FK → participants | |
| event_list_item_id | uuid FK → event_list_items (kind=document) | Which document type |
| gcs_path | string, nullable | Nullable — supports a flag-only confirmation with no file, mirroring the old code's optional `filenameSuffix` |
| content_hash | string, nullable | Same dedup pattern as bills/incident photos |
| original_filename | string, nullable | |
| drive_file_id | string, nullable | Set once the nightly/on-demand mirror sync runs |
| drive_synced_at | timestamp, nullable | |
| received_via | enum (`email`,`manual`) | |
| source_email_message_id | string, nullable | Traceability back to the Gmail message, when applicable |
| received_at | timestamp | |
| received_by_user_id | uuid FK → users | |

### Mailbox / OAuth

`MailSenderAccount` (built for Health) gets its requested scope broadened:
`gmail.readonly` or `gmail.modify` (modify is actually needed — archiving and
labeling threads requires write access to labels, not just reading) added alongside
the existing `gmail.send`. **Anyone who already connected a mailbox under Health's
narrower scope will need to re-authorize** — Gmail consent is scope-specific, it
doesn't silently expand to cover new scopes later.

### Logging — split across two tables, not one

- **`ParentEmailLog`** (already exists) — reused for anything that's genuinely a
  parent-facing email: reply-to-parent and bulk status-update, each a new
  `purpose_key` (`mail_helper_reply`, `mail_helper_bulk_status_update`). No PDF
  attached this time — `pdf_gcs_path` is already nullable.
- **`MailActionLog`** (new) — everything that *isn't* a sent email: bulk move-to-done,
  bulk delete, attachment save. Doesn't fit `ParentEmailLog`'s shape (no recipient,
  no template).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| event_id | uuid FK → events | |
| action | enum (`bulk_move`,`bulk_delete`,`attachment_saved`) | |
| message_id | string, nullable | Gmail message ID |
| participant_id | uuid FK → participants, nullable | |
| subject | string, nullable | |
| status | enum (`ok`,`error`) | |
| details | text, nullable | |
| created_at | timestamp | |

### Event-level sync settings

Added directly to `Event` (same pattern as `senderEmail`):

| Field | Type | Notes |
|---|---|---|
| drive_doc_sync_enabled | boolean, default true | |
| status_export_sheet_id | string, nullable | The Sheet this event's read-only export writes to — created once, updated in place on every sync, never recreated |
| status_export_last_synced_at | timestamp, nullable | |

---

## Infrastructure

- **GCS-primary, Drive-mirrored.** A nightly Cloud Scheduler job (same pattern as the
  exchange-rate sync) finds `ParticipantDocument` rows with `drive_file_id = null`
  and pushes each to the event's Drive folder structure — root folder → per-participant
  subfolder, recreating the old app's exact organization, named
  `{ParticipantName}_{DocumentTypeSuffix}{ext}`. Plus an on-demand "sync now" trigger
  for the same logic. One-way only.
- **Read-only Sheets export.** Reuses the Sheets-write capability already built for
  Bills' finalization manifest — no new Google API surface, just a new use of an
  existing one. Writes/updates one Sheet per event (participant name, guardian email,
  one column per document type showing received/missing), same nightly-plus-on-demand
  schedule as the Drive sync. Explicitly one-way, app → Sheet.
- **Attachment preview.** The old app's temp-Drive-file-plus-24h-cleanup workaround —
  needed because Apps Script can't stream a blob to a browser — goes away entirely.
  An authenticated API route proxies the Gmail attachment directly; the browser
  renders it natively or via `pdfjs-dist` (already a dependency). No temp files, no
  cleanup job.
- **`Role` field** — dropped, not carried into `User`. Access runs entirely through
  `user_event_module_access`, same as everywhere else on the platform.
- **Module registry** — `mail` joins `bills`/`health` in the `modules` table, gated
  the same binary per-event way.

---

## Open items

- Exact Drive folder-mirror structure — confirm root-folder-per-event,
  subfolder-per-participant is still wanted, or should follow whatever convention
  Bills' own export already established, for consistency.
- `gmail.readonly` vs `gmail.modify` — modify is the one actually needed for
  label/archive actions; confirm that's an acceptable scope ask before the
  re-consent flow goes out to anyone who already connected a mailbox for Health.
