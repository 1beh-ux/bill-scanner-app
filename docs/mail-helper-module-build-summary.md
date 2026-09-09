# Mail Helper Module — Build Summary

Status: **built and shipped** (commits `1c6ebf2`..`5174746`). Compares the actual
implementation against `mail-helper-module-design.md`. Unlike Health's build summary,
there's very little drift here — the design doc's decisions were all confirmed before
building, and the build followed them closely.

---

## Schema: matches exactly

Every table/field from the design doc's schema section exists in `prisma/schema.prisma`:

- `ListTemplateKind` enum gained the fourth `document` value alongside `med`/`slot`/
  `situation` — reuses `ListTemplateAdmin` for document-type org/event admin as planned,
  no new UI component needed.
- `ParticipantDocument` — all fields present (`gcsPath`, `contentHash`,
  `driveFileId`/`driveSyncedAt`, `receivedVia`, `sourceEmailMessageId`, etc.).
- `MailActionLog` — new table as designed, for the non-email actions (bulk move, bulk
  delete, attachment save) that don't fit `ParentEmailLog`'s shape.
- `Event` sync-settings fields — `driveDocSyncEnabled`, `statusExportSheetId`,
  `statusExportEnabled`, `statusExportLastSyncedAt` all present.
- `MailSenderAccount` scope broadened to `gmail.modify` (the design doc flagged this as
  an open question between `readonly`/`modify` — **resolved as `modify`**, since
  archiving/labeling needs write access to labels).
- `Role` field — confirmed dropped, never added to `User`. Access runs entirely through
  `UserEventModuleAccess`, exactly as decided.

## Screens: the inbox is one integrated screen, not the doc's implied separate views

| Doc concern | Status | Notes |
|---|---|---|
| Inbox + message detail | ✅ `/events/[id]/mail` | Two-pane layout: `MailInboxList` (left, with sort/select/bulk move/delete) + `MailDetailPanel` (right, 440 lines — the core screen). Header has Bulk Status and Logs buttons. `senderConfigured` banner when no mailbox is connected yet; OAuth-callback banner (`?mailConnect=connected\|error`). |
| Per-email action (attachments → document types, reply, archive) | ✅ `MailDetailPanel.tsx` + `POST .../messages/[messageId]/execute` | All three actions (save attachments as `ParticipantDocument` rows, send reply, move to done label) are independently toggleable in one request, each step logged separately — matches the design doc's "dynamic loop over document types with conditional lines" description for the reply text (`buildSingleReplyText`, mirrors the old Apps Script `buildSingleReplyTextCz_`). |
| Bulk status-update email | ✅ `BulkStatusModal.tsx` + `bulk-status-preview`/`bulk-status-send` routes | Fits the existing `EmailTemplate` `{{variable}}` model with a new purpose key, exactly as decided. |
| Action log | ✅ `MailActionLogModal.tsx` + `action-log` route | Merges `MailActionLog` and `ParentEmailLog` (mail purpose keys) into one newest-first timeline — the "split across two tables, not one" schema decision surfaces as one unified view in the UI, as intended. |
| Attachment preview | ✅ `AttachmentPreviewModal.tsx` + `.../attachments/[attachmentId]` route | Streams the Gmail attachment straight through an authenticated API route — the old app's temp-Drive-file-plus-24h-cleanup workaround is gone entirely, as planned. No `pdfjs-dist` dependency was actually needed in the end; the preview modal handles it directly. |
| Mailbox connect | ✅ `mail-oauth/authorize` + `/callback` + `mail-accounts` | Same per-mailbox OAuth pattern Health already established (`MailSenderAccount`), scope extended to `gmail.modify`. Anyone who'd connected a mailbox under Health's narrower scope needs to reconnect — expected, called out in the design doc. |

## Infrastructure: matches, one thing not yet exercised in anger

- **Drive mirror** — `syncParticipantDocumentsToDrive` (`cron/mail-drive-sync`, plus
  an on-demand `drive-sync` route) pushes GCS-primary documents to Drive, one-way,
  exactly as designed. Uses the same service-account-impersonation client (`src/lib/
  drive.ts`) as Bills' export.
- **Read-only Sheets status export** — `syncStatusSheetExport` (`cron/mail-sheets-sync`,
  plus an on-demand `sheets-sync` route) reuses the Sheets-write capability built for
  Bills' manifest export (`writeManifestValues`/`createManifestSheet` in `drive.ts`) —
  no new Google API surface, as planned. One-way, app → Sheet.
- **Module registry** — `mail` is a third entry in `modules`, gated the same
  per-event binary way as `bills`/`health`.
- Both cron routes are guarded by an `x-cron-secret` header — same pattern as the
  existing exchange-rate sync cron.

## Decisions confirmed in the doc, verified as implemented

1. Shared roster — `Participant`/`ParticipantGuardian` is the only roster; Mail Helper
   is a genuine third consumer, not a fork. ✅
2. Document types as a fourth `ListTemplateKind` — ✅, zero new admin UI needed.
3. Mailbox identity via `MailSenderAccount`, scope broadened — ✅ (see schema section).
4. Send/log infrastructure reused, per-email reply logic purpose-built — ✅.
5. `Role` field dropped — ✅.
6. Documents GCS-primary, Drive-mirrored, one-way — ✅.
7. Sheets sync scoped as read-only live export (app → Sheet), not an import — ✅, and
   stays true even after this batch's new work (see below — the *import* feature that
   now exists is a separate, one-time action, not a sync).

## New in this batch (not part of the original Mail Helper build): live Sheets import

The design doc's item 7 explicitly scoped Sheets sync as export-only and pointed at
Health's "deferred live Sheets import" as the mirror-image, opposite-direction need.
That gap is now closed — **for Health's participant roster, which Mail Helper also
reads from** — with a live Google Sheets import added to the existing paste-import
screen (`/events/[id]/health/participants/import`, now a two-tab page: paste or
Sheets-by-ID). Same shared `Participant` table both ways, so records created via
Sheets import are immediately usable by Mail Helper (attachment matching, bulk status
emails) exactly like any other participant. See the app's own docs on this — schema-
level nothing changed, it's additive UI + one new read-only API route
(`.../health/participants/sheets-preview`) using the same service-account Sheets
client Mail Helper's export already relies on (`readSheetValues`, `src/lib/drive.ts`).

## Still missing / stubbed

- **Drive folder-mirror exact structure** — the design doc's open item ("confirm
  root-folder-per-event, subfolder-per-participant, or follow Bills' convention") —
  shipped as designed (root → per-participant subfolder), not verified against Bills'
  own folder convention for consistency. Worth a quick look, not blocking.
- **Nothing else flagged** — reading through both the design doc and the shipped
  routes/components, this module has no significant gap between plan and build. The
  only real deviation from Health's experience (where the mail-sending infra itself
  needed a pivot away from domain-wide delegation) is that Mail Helper inherited that
  already-solved OAuth pattern from day one, so there was no equivalent surprise here.

## New/changed files

**Schema & migrations**
- `prisma/schema.prisma` — `ListTemplateKind.document`, `ParticipantDocument`,
  `MailActionLog`, `Event` sync-settings fields, `MailSenderAccount` scope.
- Mail Helper foundation migration (commit `1c6ebf2`) — schema above.

**Pages**
- `src/app/events/[id]/mail/page.tsx` — inbox + detail, the module's one screen.

**Components** (`src/components/mail/`)
- `MailInboxList.tsx` — inbox list, sort/select/bulk move/delete.
- `MailDetailPanel.tsx` — message detail, participant match/override, attachment→
  document-type mapping, reply text, execute actions. The largest component (440
  lines) — does most of the module's real work.
- `BulkStatusModal.tsx` — bulk status-update send flow.
- `MailActionLogModal.tsx` — merged action-log timeline.
- `AttachmentPreviewModal.tsx` — preview a Gmail attachment before saving.
- `types.ts` — shared `DocumentType`/`MailMessage`/`Participant` types.

**API routes** (all under `src/app/api/events/[id]/mail/` unless noted)
- `messages/route.ts` — inbox list.
- `messages/[messageId]/execute/route.ts` — the core action executor (save
  attachments, send reply, archive — independently toggleable).
- `messages/[messageId]/reply-preview/route.ts`, `.../delete/route.ts`,
  `.../attachments/[attachmentId]/route.ts` — reply text preview, single delete,
  attachment streaming.
- `messages/bulk-move/route.ts`, `bulk-delete/route.ts` — bulk actions, per-message
  try/catch, logged individually.
- `bulk-status-preview/route.ts`, `bulk-status-send/route.ts` — bulk status-update
  email flow.
- `action-log/route.ts` — merged timeline read.
- `sync-settings/route.ts` — toggles Drive/Sheets sync on/off per event.
- `sheets-sync/route.ts`, `drive-sync/route.ts` — on-demand sync triggers.
- `participants/route.ts` — mail-scoped lean roster (id/name/guardians) for
  match/override UI.
- `src/app/api/mail-accounts/route.ts` — connected mailbox listing.
- `src/app/api/mail-oauth/authorize/route.ts`, `.../callback/route.ts` — OAuth
  connect flow.
- `src/app/api/cron/mail-drive-sync/route.ts`, `.../mail-sheets-sync/route.ts` —
  scheduled sync jobs.
- **New this batch**: `src/app/api/events/[id]/health/participants/sheets-preview/
  route.ts` — reads an arbitrary Sheet by ID for the live import feature.

**Lib**
- `src/lib/mail.ts` — Gmail send (MIME building, plain-text + PDF-attached).
- `src/lib/mail-token-crypto.ts` — AES-256-GCM refresh-token encryption.
- `src/lib/gmail-client.ts` — per-mailbox cached OAuth2 client.
- `src/lib/drive.ts` — shared Drive/Sheets client (service-account impersonation);
  gained `readSheetValues` this batch for the live import feature.
- Mail-specific status export / doc sync helpers (`syncStatusSheetExport`,
  `syncParticipantDocumentsToDrive`) alongside the existing `mail-sheets-sync.ts`.
