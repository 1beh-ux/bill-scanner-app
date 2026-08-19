# Bill Scanner / Camp Platform — Project Summary

Working name in the codebase is still "Bill Scanner V2," but the app has grown
past that: it's a multi-event platform for a camp/org, with **Bills** (expense
tracking) and **Health** (medical log + parent communication) as its two
current modules, sharing one foundation (events, auth, per-event module access,
Drive/GCS integration). A third module, **Mail Helper**, is referenced in the
Health design doc as future work but not started.

Stack: Next.js 16 (App Router) + React 19, Prisma 7 / Postgres (Cloud SQL),
Firebase Auth (session cookies), Google Cloud Run for hosting, Google Cloud
Storage for files, Google Drive API for import/export, Google Tasks for async
job queueing, Google Cloud Scheduler for cron. Deployed as a single Cloud Run
service (`bill-scanner-app`) plus two satellite Cloud Run services it calls
over authenticated IAM: `bill-scanner-ai` (AI bill-data extraction) and
`bill-scanner-pdf` (headless-browser HTML→PDF rendering).

---

## Modules

### Bills (the original app)

Event-scoped expense tracking, built first (milestones 0–7 of the original
Bills build, before Health existed):

- **Ingest:** camera/upload capture or a Google Drive folder watch
  (`drive-import.ts`), with perspective correction/crop for photographed
  receipts, content-hash dedup, and image→PDF export.
- **AI extraction:** a dedicated Cloud Run service (`bill-scanner-ai`) pulls
  merchant/date/amount/currency out of each bill; processing runs async
  through Cloud Tasks (single and bulk), with retry and failure visibility in
  the UI, not just a spinner.
- **Review & approval:** bulk select, mass approve/delete, inline edits,
  merchant canonicalization (`merchant-aliases.ts`) so "Kaufland Praha 3" and
  "KAUFLAND CR" collapse to one author-facing name.
- **Money handling:** multi-currency (CZK/PLN/EUR) with daily CNB
  exchange-rate sync (`cron/exchange-rates`) and on-demand backfill for
  missing dates; QR-platba payment codes for CZK payouts; paid/unpaid
  tracking per bill and in bulk, with a paid/unpaid scope toggle.
- **Categories & budget:** the org-default → per-event-editable-copy pattern
  (`category_templates` → `event_categories`) that later became the platform
  pattern reused four more times in Health; a per-event budget summary page.
- **Authors (payees):** merge/dedup, per-event access grants, bank details for
  payout.
- **Export:** generates the org's own archive copy in the event's Drive export
  folder, plus a companion manifest spreadsheet.
- **Audit trail:** `bill_audit_log` — field-level diff logging for edits/
  approve/reopen actions (the model Health's incident log deliberately did
  **not** copy — see below).

### Health (built second, on top of the platform Bills established)

Ported from a prior Google Apps Script tool ("Camp Medical Log") that used a
Sheet as its database, rebuilt on Postgres/Prisma and integrated with events/
auth/GCS/Drive. Full comparison against its two design docs lives in
[`health-module-build-summary.md`](./health-module-build-summary.md) — short
version:

- **Participant roster** (event-scoped, not shared across events) with
  multiple guardians per participant, each independently opted in/out of
  communications.
- **Paste-from-Sheets import** with header auto-matching, multi-column merge,
  date-order disambiguation, and duplicate detect/merge/skip — mirrors the
  bulk-review pattern from Bills import instead of building a new one.
- **Incident log**, snapshot-per-edit (a full new row per edit, not a diff —
  deliberately different from `bill_audit_log`'s style, since Health doesn't
  need field-level diffing at this volume), with follow-ups, a body-map
  picker (tap-to-mark on an inline-SVG silhouette), and photo attachments via
  the same GCS pipeline Bills already had.
- **Meds administration**: templated meds/time-slots/situations (org default →
  per-event copy — the fourth application of the Bills-established template
  pattern, generalized into one `list_templates`/`event_list_items` mechanism
  instead of writing it four times), a daily checklist grid, and a PDF export
  service.
- **Parent communication**: `{{variable}}`-templated emails, single or bulk
  send with per-recipient failure isolation, a send log with resend-on-fail,
  and a PDF attached directly to the email (not a Drive share link, to avoid
  managing external sharing permissions).
- **Module access system**: this is the platform-level change Health forced —
  `user_event_access` (Bills-only, implicit) was retired in favor of
  `user_event_module_access`, a binary per-event-per-module grant. Bills
  joined the same registry as a normal module so a Health-only volunteer
  doesn't see a Bills nav item they can't use. Migration was lossless: every
  existing access row became a `bills` grant, every existing event got
  `bills.enabled = true`.

---

## Shared platform pieces

- **Auth:** Firebase Auth issuing session cookies, verified server-side
  (`src/lib/auth.ts`) against a local `User` row (role: admin / accountant /
  user). Admin is an unrestricted superuser across every module and event;
  accountant keeps an implicit Bills-only shortcut; everyone else needs
  explicit per-event, per-module grants.
- **Events:** the shared scoping unit for both modules — name, date range,
  status (active/closed), Drive folders for ingest/export, and now a
  `senderEmail` pointing at a connected mailbox for Health's parent emails.
- **Navigation:** a persistent sidebar (`AppSidebar.tsx`) grouped by module,
  showing/hiding Health's section per the same access grant the API enforces
  server-side.
- **i18n:** `cs`/`en` UI strings live in a `translations` DB table (not
  `prisma/seed.ts`) — edited through an admin-only Translations page, seeded
  incrementally per feature via one-off scripts in `scripts/`.
- **Templates admin (`/templates`):** one page, two tabs — Bills' category
  templates and Health's three template kinds — the natural home once Health
  needed the same "org default, admin manages it somewhere" screen.

---

## Infrastructure

- **Hosting:** `bill-scanner-app` on Cloud Run (europe-west3), built/deployed
  via `cloudbuild.yaml` — Cloud SQL Postgres attached directly, secrets pulled
  from Secret Manager at deploy time (DB URL, cron/tasks/PDF shared secrets,
  mail token encryption key, mail OAuth client secret).
- **Satellite services**, both called with real Cloud Run IAM auth (ID tokens)
  since the org's policy blocks public `allUsers` invoker bindings:
  - `bill-scanner-ai` — bill data extraction.
  - `bill-scanner-pdf` — Puppeteer/Playwright-style headless render for both
    Health PDFs (meds grid, parent summaries) and, per the design doc, chosen
    over `pdf-lib` because the source layouts are HTML/CSS documents, not
    programmatically-drawn ones.
- **Async work:** Google Cloud Tasks for bill AI processing (queued, retried);
  Cloud Scheduler for daily exchange-rate sync and a stuck-bill requeue job.
- **Files:** GCS for originals/photos with content-hash dedup; Google Drive
  for org-facing import/export, via a dedicated `bill-scanner-drive` service
  account.
- **Email:** originally designed around a second service account
  (`bill-scanner-mail@...`) using Workspace domain-wide delegation to
  impersonate a fixed mailbox — built, then **rejected by the Workspace
  admin**. Live implementation instead uses per-mailbox OAuth: each real
  Workspace mailbox owner grants `gmail.send` consent once, and the app stores
  their encrypted refresh token (`MailSenderAccount`), reusable across events.

---

## Where things stand

Both modules are in production use. Health is the more recently active area
of work (commits `f1c064f`..`6cca9db`), having gone through seven build
milestones: foundation/access system, participant CRUD, paste import,
incidents (form/body-map/photo/timeline), templates + med plans + daily
checklist, PDF export pipeline, and parent email summaries — each shipped and
iterated on (e.g. the meds grid was rebuilt twice for layout/print
correctness, most recently commit `6cca9db`). Known gaps are tracked in the
Health build summary: no live Google Sheets import yet, no flat "plan"-style
meds PDF (grid-only), and a couple of minor navigation/indicator omissions
from the original UI-flows draft.
