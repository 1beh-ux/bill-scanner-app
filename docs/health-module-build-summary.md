# Health Module — Build Summary

Status: **built and shipped** (milestones 0–7, commits `f1c064f`..`6cca9db`). This
compares the actual implementation against the two design drafts —
`bill-scanner-v2-health-module-design.md` (schema/access/infra) and
`bill-scanner-v2-health-module-ui-flows.md` (screens/copy) — and records what
matches, what changed, and what's still open.

---

## Schema: matches, with a few resolved-in-code decisions

All core tables from the design doc exist in `prisma/schema.prisma` essentially
as specified: `Participant`, `ParticipantGuardian`, `Incident`, `IncidentUpdate`,
`ListTemplate`/`EventListItem` (meds, slots, situations), `ParticipantMedPlan`,
`MedChecklist`, `EmailTemplate`/`EventEmailTemplate`, `ParentEmailLog`, plus the
shared `Module`/`EventModule`/`UserEventModuleAccess` registry.

- **Generic template mechanism built as suggested.** The design doc's "build
  note" — one `list_templates`/`event_list_items` pair with a `kind`
  discriminator instead of four hand-written CRUD scaffolds — is exactly what
  shipped (`ListTemplateKind` enum: `med`/`slot`/`situation`; a `data: Json?`
  column carries per-kind extra fields like situation defaults). One
  `ListTemplateAdmin` component drives all three admin screens (org and
  per-event).
- **`Incident` gained fields not in the original draft:** `incidentDate` +
  `incidentTime` (the draft only had `createdAt`; a backdatable incident date
  turned out to be necessary) and `Participant.dateOfBirth` (the draft had no
  DOB field — added for age display and CSV/paste import).
- **`status` correctly dropped**, exactly as the doc's "Resolved" section says.
  Void is `incident_updates.update_type = 'void'`, filtered from reads — see
  `src/lib/incident-state.ts`.
- **Bills-as-a-module migration happened as designed:** `user_event_access` is
  gone, replaced by `UserEventModuleAccess`; the accountant shortcut is
  re-scoped to `bills` only in code (`src/lib/module-access.ts`
  `hasModuleAccess`), matching decision 2 exactly.

## Screens: all ten from the UI-flows doc exist, laid out slightly differently

| Doc screen | Status | Notes |
|---|---|---|
| 1. Participants list | ✅ `/events/[id]/health` | Search, add form, bulk delete (extra, not in doc). **Deviation:** no "Importovat účastníky" button on this page — import instead lives as its own sidebar nav item (`AppSidebar.tsx`). No open-incident "dot" indicator per row — not built. |
| 1a. Participant import | ✅ `/events/[id]/health/participants/import` | Paste-from-Sheets exactly as specced: header auto-match, multi-column merge with labeled joins for notes fields, day/month-ambiguous date detection, duplicate detect+merge+skip, preview table. **Live Google Sheets import not built** — doc marked it "planned," correctly left as future work. |
| 2. Participant detail | ✅ `/events/[id]/health/participants/[participantId]` | Structured notes, guardians with `receivesCommunications` toggle, incident timeline (newest-first, indented/collapsible follow-ups), "Odeslat souhrn rodičům" + "Stáhnout PDF" buttons — all present. |
| 3. Incident form modal | ✅ `IncidentFormModal.tsx` | Situation-template chips, category/temp/summary/med/details, body map, single photo upload, follow-up mode locks category/template/location. Matches doc's three-mode design. |
| 4. Incident detail modal | ✅ `IncidentDetailModal.tsx` | Read-only view, edit → writes `incident_updates` row, "+ Follow-up." |
| 5. Meds administration | ✅ `/events/[id]/health/meds` | Date range picker (bounded to event dates, with today/week/event/custom presets — richer than the doc's plain date+slot picker), checklist grouped by participant, tap-name-for-notes safety check preserved. **Deviation:** shipped as one merged grid page (commit `841f65e`/`841f65e`), not a separate checklist screen — see PDF note below. |
| 6. Meds print | ⚠️ Partial | Grid report (weeks × days × participant+med) in blank/hybrid mode, plus an A4/A3 format choice (extra) — via the real headless-PDF service, as designed. **The "plan" report type (flat list per slot) from the doc was not built** — only `buildMedsGridPdfHtml` exists in `src/lib/med-report-templates.ts`, no plan equivalent. Scope was consolidated to grid-only. |
| 7. Event Health settings | ✅ Tab within `/events/[id]` | **Deviation:** doc calls this a tab within `/events/[id]/settings`; there is no separate `/settings` route — event admin (categories, Drive, access, health, modules) is five tabs inside the existing `/events/[id]` page itself. Shared **Přístup** access tab exists exactly as designed — one grid, admins × modules, not Health-specific. |
| 8. Org-wide Health admin | ✅ `/templates` (Health tab) | Med templates, situation templates, org-default email template with variable palette + preview — all present. **Deviation:** doc assumed this lives "alongside category_templates"; it shipped as a `Health`/`Bills` tab split inside one `/templates` page (an earlier separate `/health-templates` route was built first, then merged in — see file list). |
| 9. Sending (single + bulk + log) | ✅ | Single send from participant detail (`SendSummaryModal.tsx`) with recipient list, subject preview, PDF link before send. Bulk send + send log combined into one page (`/events/[id]/health/send-summaries`) with a tab switch, rather than the doc's "could live as a tab in Participant Detail plus a rollup" — the rollup won out as the primary home, and the log is *also* embedded in Participant Detail (`ParentEmailLogTable` reused in both places). Per-recipient failure isolation implemented. |
| 10. PDF content (parent summary) | ✅ `src/lib/parent-summary-template.ts` + `parent-summary-pdf.ts` | Header, structured notes, body map with numbered markers, threaded timeline — rendered server-side via the PDF Cloud Run service. Also pushes a copy to the event's Drive export folder (best-effort — a Drive failure doesn't block send/download), matching the design doc's infra section. |

## Infrastructure: matches, with one major documented pivot

- **Photos:** reuse GCS content-hash pipeline as designed — `src/app/api/events/[id]/incident-photos/route.ts`, no separate cleanup job.
- **Body silhouettes:** the design doc assumed bundled static image assets;
  **no such source art existed to port**, so `BodyMapPicker.tsx` draws a
  schematic humanoid outline as inline SVG instead (documented in-code: "not
  medical-grade art... but a solid silhouette with real width on the limbs").
  Functionally equivalent (front/back tap targets, percentage coordinates
  stored), just a different asset strategy.
- **PDF generation:** built exactly as designed — a separate headless-browser
  Cloud Run service (`bill-scanner-pdf`), called over authenticated Cloud Run
  IAM (ID token + a secondary `x-pdf-secret` header), not `pdf-lib`. See
  `src/lib/pdf-service.ts`.
- **Email sending — the one significant pivot from the design doc.** The doc
  specified a dedicated `bill-scanner-mail@...` service account using
  **domain-wide delegation** to impersonate a fixed functional mailbox
  (`zdravotnik@zare.cz`). That was fully built first (commit `124d9ec`) but
  **the Workspace admin rejected authorizing domain-wide delegation**. Shipped
  fallback: per-mailbox OAuth consent — each real mailbox owner grants
  `gmail.send` scope themselves via `/api/mail-oauth`, and the refresh token
  is stored encrypted (`MailSenderAccount`, `src/lib/mail-token-crypto.ts`).
  `Event.senderEmail` picks which connected mailbox an event sends from. The
  domain-wide-delegation code is still in git history (`124d9ec`) and called
  out in a comment in `src/lib/mail.ts` as restorable if the org policy ever
  changes.

## Decisions confirmed in the doc, verified as implemented

1. Snapshot-per-edit incident updates — ✅ (`incident_updates`, no diffing).
2. Binary per-event module access, no internal Health role tiers — ✅.
3. Org-default → per-event-copy pattern, generalized to one mechanism — ✅ (built even more unified than asked, single component + table pair for all three kinds).
4. Participants event-scoped, direct FK, no join table — ✅.
5. Multiple guardians per participant, each with own email — ✅.
6. PDF attached to email, not a Drive link — ✅.
7. Czech-only parent email copy — ✅, no `cs`/`en` split on `email_templates`.
8. Parent email sending in scope now, with its own admin page — ✅.

## Still missing / stubbed

- **Live Google Sheets participant import** (Screen 1a's second tab) — not
  built. Correctly scoped as a follow-on in both docs; paste-import fully
  covers the current need.
- **Meds "plan" PDF report type** (flat list per slot) — not built; only the
  grid report shipped. Not documented as an explicit descope anywhere in
  commit history, worth a decision either way (build it, or update the design
  doc to drop it).
- **Per-row "open/recent incidents" indicator dot** on the participants list
  (Screen 1) — not built.
- **"Importovat účastníky" button on the participants list itself** — import
  is reachable only via the sidebar's Health section, not from Screen 1 as
  drafted. Minor navigation gap, not a missing feature.
- **Domain-wide delegation mail sending** — built, then shelved for policy
  reasons (see above); per-mailbox OAuth is what's live in production.

## New/changed files

Files added by the health module build (`f1c064f`..`6cca9db`; a few were later
deleted/merged, noted below):

**Schema & migrations**
- `prisma/schema.prisma` — +300 lines: Health module models, module registry, enums.
- `prisma/migrations/20260818105808_add_health_module_foundation/` — initial Health schema.
- `prisma/migrations/20260818112829_add_user_role/` — adds `UserRole` enum for access checks.
- `prisma/migrations/20260818123829_incident_date_optional_details_participant_dob/` — adds `incidentDate`/`incidentTime`, `Participant.dateOfBirth`.
- `prisma/migrations/20260819071400_add_event_sender_email/` — `Event.senderEmail`.
- `prisma/migrations/20260819074944_add_mail_sender_accounts/` — `MailSenderAccount` (the OAuth pivot).

**Pages**
- `src/app/events/[id]/health/page.tsx` — participants list.
- `src/app/events/[id]/health/participants/import/page.tsx` — paste importer.
- `src/app/events/[id]/health/participants/[participantId]/page.tsx` — participant detail + timeline.
- `src/app/events/[id]/health/meds/page.tsx` — meds grid (checklist + overview + PDF export, merged in `841f65e`/`6cca9db`).
- `src/app/events/[id]/health/send-summaries/page.tsx` — bulk send + send log.
- `src/app/templates/page.tsx` — org-wide admin (Health + Bills category templates tabs); absorbed the earlier standalone `src/app/health-templates/page.tsx` (deleted).
- `src/app/translations/page.tsx` — admin-only translations editor (not Health-specific, but shipped alongside it for the bilingual UI strings this module needed).

**Components**
- `src/components/health/BodyMapPicker.tsx` — inline-SVG body silhouette + tap-to-mark.
- `src/components/health/IncidentFormModal.tsx` — new/edit/follow-up incident form.
- `src/components/health/IncidentDetailModal.tsx` — read-only incident view.
- `src/components/health/ListTemplateAdmin.tsx` — generic admin CRUD for meds/slots/situations, org or event scope.
- `src/components/health/EmailTemplateAdmin.tsx` — subject/body editor with variable palette + preview.
- `src/components/health/TemplatePreviewModal.tsx` — dummy-data email preview.
- `src/components/health/SendSummaryModal.tsx` — single-send confirmation.
- `src/components/health/ParentEmailLogTable.tsx` — reused in both participant detail and the event rollup.
- `src/components/health/PdfExportControls.tsx` — mode/format selector for PDF downloads (meds grid + parent summary).
- `src/components/health/SenderEmailField.tsx` — picks/connects the OAuth mailbox an event sends from.

**API routes** (all under `src/app/api/`)
- `events/[id]/participants/route.ts`, `.../participants/bulk/route.ts` — list/create/bulk-delete.
- `participants/[id]/route.ts`, `.../guardians/route.ts` + `[guardianId]/route.ts`, `.../incidents/route.ts`, `.../med-plans/route.ts` + `[planId]/route.ts`, `.../emails/route.ts` + `[logId]/resend/route.ts`, `.../send-preview/route.ts`, `.../send-summary/route.ts`, `.../summary-pdf/route.ts` — full participant sub-resource surface.
- `incidents/[id]/route.ts`, `.../updates/route.ts` — incident edit/void.
- `events/[id]/health/emails/route.ts`, `.../sender-email/route.ts`, `.../send-summaries/route.ts` — event-level bulk send/log/sender config.
- `events/[id]/incident-photos/route.ts` + `[filename]/route.ts` — photo upload/serve.
- `events/[id]/med-checklist/route.ts`, `.../grid/route.ts`, `.../export/route.ts` — checklist CRUD, grid read, PDF export.
- `list-templates/route.ts` + `[id]/route.ts`, `events/[id]/list-items/route.ts` + `[itemId]/route.ts` + `sync/route.ts` — generic template mechanism CRUD + org→event sync.
- `email-templates/route.ts`, `events/[id]/email-template/route.ts` — email template CRUD (org + per-event).
- `events/[id]/module-access/route.ts`, `.../modules/route.ts` + `.../modules/mine/route.ts` — access grid + module toggle.
- `mail-accounts/route.ts`, `mail-oauth/authorize/route.ts` + `.../callback/route.ts` — OAuth mailbox connect flow.
- `me/route.ts` — current-user endpoint (added for client-side role/access checks).
- `events/[id]/categories/sync/route.ts` — same org→event sync pattern applied back to Bills' category templates, for consistency.

**Lib**
- `src/lib/age.ts` — DOB → age.
- `src/lib/incident-state.ts` — resolves latest state from base row + `incident_updates`, filters voided.
- `src/lib/module-access.ts` — `hasModuleAccess`/`requireModuleAccess`/`getEnabledModules`.
- `src/lib/participant-delete.ts` — cascading participant delete.
- `src/lib/med-checklist-grid.ts`, `src/lib/med-export-layout.ts`, `src/lib/med-report-templates.ts` — grid data fetch, PDF page-layout math, HTML template rendering.
- `src/lib/parent-summary-template.ts`, `src/lib/parent-summary-pdf.ts` — per-participant summary HTML + PDF generation/Drive archive.
- `src/lib/email-template.ts`, `src/lib/email-template-preview.ts` — `{{variable}}` resolution, dummy-data preview.
- `src/lib/parent-email-send.ts` — send orchestration with per-recipient failure isolation.
- `src/lib/mail.ts`, `src/lib/mail-token-crypto.ts` — Gmail API sending, encrypted refresh-token storage.
- `src/lib/pdf-service.ts` — client for the `bill-scanner-pdf` Cloud Run service.

**Scripts** (i18n seeding, one-off)
- `scripts/seed-meds-grid-i18n.ts`, `scripts/seed-milestone7-mail-i18n.ts`, `scripts/seed-settings-restructure-translations.ts`, `scripts/seed-translations-admin-page-i18n.ts`, `scripts/rename-budget-translation.ts` — bilingual string seeding, one per UI milestone (translations live in the DB, not `prisma/seed.ts`).
