# Registration workflow — design notes (placeholder, 2026-09-09)

Status: **plumbing built, content placeholder.** Pavel said he'll specify the exact
acceptance-email wording and which documents get attached later — this batch builds
the mechanism so that's a content edit later, not a feature to build later.

## The flow this supports

1. A Google Form feeds a Google Sheet (Pavel's registration form, outside this app).
2. Admin imports from that Sheet into the app's participant roster — **reuses the
   live Google Sheets import already built** (`/events/[id]/health/participants/import`,
   "Google Sheets" tab: paste/share the Sheet with the app's service account, paste
   the Sheet ID or link, map columns once). No new import mechanism was needed —
   every new `Participant` (however created: manual, pasted, or Sheets-imported)
   starts with `registrationStatus = pending` by default.
3. Admin reviews the pending list (Health → participants table, new "Registrace"
   and "Dokumenty" columns) and decides, per person or in bulk, to accept — this is
   a deliberate action, **not automatic** on import (unlike the old Apps Script,
   which auto-sent documents on registration).
4. "Accept and send" opens a compose dialog prefilled from an editable email
   template (purpose key `registration_acceptance`, edit at event settings → Health
   tab, or the org default at Templates → Email), with an optional file attachment
   (any file picked at send time — no document-generation exists yet, so this is the
   manual stand-in for "creates and sends them documents"). Sending marks the
   participant `accepted` and logs the send (`ParentEmailLog`), regardless of
   whether the email itself succeeded (a bad address shouldn't block the accept
   decision — resend separately if needed).
5. Once accepted, the existing document-tracking mechanism applies unchanged:
   define document types (e.g. "Přihláška") via the existing admin UI (Event
   settings → Mail tab → document list, same place Mail Helper's document types
   already live — `kind: document` on `EventListItem`), and documents get marked
   received the same way Mail Helper already does (an attachment on an inbound
   email gets matched to a participant + document type). The participants table's
   "Dokumenty" column shows a running `received/total` count.
6. **Open email to selected people** — a second, independent use of the same
   compose dialog (`ComposeEmailModal`, `mode="freeform"`): select any rows in the
   participants table, write ad hoc subject/body + optional attachment, send. Not
   tied to a saved template or to registration status — the admin picks who by
   selecting rows (the "Registrace" column makes it easy to eyeball who's accepted).
7. **"Odesílání pošty"** button on the participants page opens the existing
   `BulkStatusModal` (previously only reachable from the Mail Helper inbox) — the
   already-built "which documents are still missing" bulk-status-update email.

## What's genuinely new vs. reused

New: `Participant.registrationStatus` (schema), the `registration_acceptance` email
purpose (placeholder subject/body — edit before real use), `sendEmailWithOptionalAttachment`
(generalizes the existing PDF-attachment MIME builder to an arbitrary file),
`sendBulkParticipantEmail`/`/api/events/[id]/participants/bulk-email` (mirrors
`sendBulkStatusUpdates` exactly), `ComposeEmailModal`, and the two new participants-
table columns + row/bulk actions.

Reused, unchanged: the live Sheets import, the shared `Participant`/
`ParticipantGuardian` roster, `ListTemplate`/`EventListItem` document types,
`ParticipantDocument` received-tracking, `EmailTemplate`/`EventEmailTemplate`
org-default-then-event-override mechanism, `BulkStatusModal`.

## Open / deliberately deferred

- **Real acceptance-email copy + which document(s) get attached** — placeholder
  text says so explicitly (`[PLACEHOLDER: ...]`) in `src/lib/email-template.ts`.
  Edit via the admin UI once decided; no code change needed for that.
- **No document-generation** — attaching the přihláška (or anything else) is a
  manual file picker in the send dialog for now. Auto-generating and attaching a
  filled document is a real future feature, not built here.
- **No "rejected"/"waitlisted" status** — only `pending`/`accepted` exists. Not
  asked for; add if it becomes a real need (the enum is a one-line schema change).
- **Every participant defaults to `pending`**, including ones an admin types in
  directly (not just Sheets-imported ones) — simplest uniform rule rather than
  tracking "how was this participant created." Minor friction (one extra click to
  accept someone the admin just typed in themselves) traded for not adding a new
  "source" concept nobody asked for.
- This is a schema change (`registrationStatus` field + `RegistrationStatus` enum)
  — needs `npx prisma migrate dev --name add_registration_status` run **on a
  machine with real network access** (this cloud sandbox can't reach
  `binaries.prisma.sh` to run Prisma's own tooling — verification here stopped at
  `eslint`).
