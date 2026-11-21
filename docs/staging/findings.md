# Staging environment — Round 1 findings (read-only)

Date: 2026-11-21. Branch: `infra-staging`. Everything below was gathered with read-only commands
(`gcloud … list/describe/get-iam-policy`, `prisma migrate status`, reading files). Nothing was created,
changed or deleted. No personal data was read or printed; the only production database access was
`prisma migrate status` (schema metadata only).

GCP project `prvni-beh-filesaver` (billing enabled), main region `europe-west3`. Firebase project is the
same project (`prvni-beh-filesaver`).

## 0. Corrections to the assumed stack

| You assumed | Actually |
|---|---|
| Production deploys from `main` (or a tag) via Cloud Build trigger | **There are no Cloud Build triggers** (checked global, `europe-west1`, `europe-west3`). Every deploy is a manual `gcloud builds submit --config=cloudbuild.yaml … .` from Cloud Shell, normally via `~/claude-helpers/deploy.sh`. It builds **whatever is checked out in `~/bill-scanner-app`, including uncommitted changes**, on any branch. The main branch is `master`, not `main`. Today prod = `master` = `96eb11b` (revision `bill-scanner-app-00163-r7v`, 2026-11-12). |
| `--no-cpu-throttling` must be kept | `cloudbuild.yaml` deploys with **`--cpu-throttling`** (request-based billing), deliberately — background work goes through Cloud Tasks. Keep that. |
| Migrations run on deploy | Not in Cloud Build. `deploy.sh` starts `cloud-sql-proxy` in Cloud Shell, runs `prisma migrate deploy` **directly against production**, then ~45 `scripts/seed-*-i18n.ts` translation upserts, then `gcloud builds submit`. |
| Firebase Auth has the sign-in allowlist | Firebase only verifies the Google identity. The allowlist is the app's **`User` table** (`src/app/api/session/route.ts`): unknown or inactive e-mail → 403. |
| App calls Vertex AI | The app calls a separate Python service **`bill-scanner-ai`** (Cloud Run, **`europe-west1`**) with an ID token; that service calls Vertex/Gemini. |
| "Outgoing e-mail" | No SMTP/SendGrid. Mail goes through the **Gmail API using per-mailbox OAuth refresh tokens** stored encrypted in the DB (`MailSenderAccount`, key `MAIL_TOKEN_ENC_KEY`). |

## 1. Existing staging / test environment

**None exists.** No staging Cloud Run service, no second database or instance, no triggers, no second
Firebase project for this app (other projects on the account: `kasicka-auth`, `nifty-caster-488308-i0` —
unrelated as far as I can see). Local development (`npm run dev` in Cloud Shell) runs against the
**production database** through `cloud-sql-proxy` (see `~/claude-helpers/run-db.sh`, memory note on the proxy).
So today *all* testing happens on production data. Many branches exist locally (`registration-slice*`,
`orgs-*`, …) but they are feature branches, not environments.

## 2. Build and deploy

- `cloudbuild.yaml`: (1) `docker build` with four `NEXT_PUBLIC_FIREBASE_*` build args from substitutions,
  image `europe-west3-docker.pkg.dev/prvni-beh-filesaver/bill-scanner-repo/app:$BUILD_ID`; (2) push;
  (3) `gcloud run deploy bill-scanner-app` with flags that must be kept:
  `--no-invoker-iam-check`, `--add-cloudsql-instances=…:bill-scanner-db`, `--update-secrets=…` (8 secrets),
  `--update-env-vars=…` (12 vars, see §8), `--cpu=1`, `--timeout=600`, `--max-instances=3`, `--cpu-throttling`.
  The service name, env vars, Cloud SQL instance and Firebase args are **hard-coded for production** — a
  staging deploy cannot reuse this file unchanged.
- `Dockerfile`: node:20-slim multi-stage, `prisma generate` with a dummy URL, `next build` with 4 GB heap,
  standalone output, copies `@google-cloud/tasks` + `google-gax` manually. No env-specific logic. Reusable as is.
- Build service account: `1050716617948-compute@developer.gserviceaccount.com` (default compute SA),
  logging `LEGACY`, source bucket `prvni-beh-filesaver_cloudbuild` (US).
- Last 8 builds: all manual submits, all SUCCESS, latest 2026-11-12.
- Other Cloud Run services (not built by `cloudbuild.yaml`): `bill-scanner-pdf` (europe-west3, own deploy),
  `bill-scanner-ai` (europe-west1, `gcloud run deploy --source`), `bill-processor` and
  `bill-processor-fresh` (europe-west1, SA `bill-processor-sa@`, env names suggest an Apps Script
  integration — legacy?).

## 3. Cloud Run (production app `bill-scanner-app`, europe-west3)

- URL `https://bill-scanner-app-sml4zhisya-ey.a.run.app`; public domain `tabornik.online` via global HTTPS
  load balancer `tabornik-lb` → backend `app-backend` → serverless NEG `app-neg` (no IAP, no Cloud Armor).
- Revision `bill-scanner-app-00163-r7v`, 100 % traffic, no tags.
- Runtime SA: **default compute SA** (same as the build SA).
- Ingress `all`, invoker IAM check disabled (public; the app does its own auth).
- 1 CPU, 2 GiB, concurrency 80, timeout 600 s, max 3 instances, min 0, CPU throttling on, startup CPU boost.
- Secrets (env ← secret): `DATABASE_URL←db-url-secret`, `CRON_SECRET←cron-secret`, `TASKS_SECRET←tasks-secret`,
  `PDF_SECRET←pdf-secret`, `MAIL_TOKEN_ENC_KEY←mail-token-enc-key`,
  `MAIL_OAUTH_CLIENT_SECRET←mail-oauth-client-secret`, `PORTAL_SECRET←portal-secret`,
  `BANK_TOKEN_ENC_KEY←bank-token-enc-key` (all `:latest`).
- Env vars: `GCS_BUCKET_NAME, DRIVE_SERVICE_ACCOUNT_EMAIL, AI_SERVICE_URL, GCS_SIGNING_SERVICE_ACCOUNT,
  APP_BASE_URL, GOOGLE_CLOUD_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE, PDF_SERVICE_URL,
  MAIL_OAUTH_CLIENT_ID, CANONICAL_HOST, LB_IP`.

## 4. Cloud SQL

- One instance `bill-scanner-db`: POSTGRES_16, **db-f1-micro** (shared core, 0.6 GB RAM), ENTERPRISE,
  zonal `europe-west3-a`, 10 GB SSD with auto-resize.
- Databases: `billscanner` (app), `postgres`. Users: `app_user`, `postgres` (built-in).
- Connection: public IP enabled but **no authorized networks**, so only the Cloud SQL connector works —
  Cloud Run via Unix socket (`…@/billscanner?host=/cloudsql/prvni-beh-filesaver:europe-west3:bill-scanner-db`),
  Cloud Shell via `cloud-sql-proxy`. `sslMode: ALLOW_UNENCRYPTED_AND_ENCRYPTED` (harmless while only the
  connector can reach it).
- Backups: automated daily 03:00 UTC, 7 retained, last 3 successful.
  **Point-in-time recovery is NOT enabled** (`pointInTimeRecoveryEnabled` unset, although transaction-log
  retention shows 7 days). **Deletion protection is OFF.**

## 5. Prisma

- Prisma 7.9 with `@prisma/adapter-pg`, config in `prisma.config.ts` (URL from `DATABASE_URL`,
  seed `tsx prisma/seed.ts`). Schema `prisma/schema.prisma`. Next.js 16.4.5.
- 131 migrations (`20260805074636_init` … `20261121090100_people_module_parts_backfill`).
  `prisma migrate status` on production: **up to date**.
- Migrations are applied by hand from Cloud Shell before each build (see §0); there is no migration step in
  the container or in Cloud Build, and no backup step before migrating.
- `prisma/seed.ts` (748 lines): creates users with **real organisation e-mail addresses** and base
  translations/templates. Not usable for staging as is.
- **Translations live in the DB**: ~78 `scripts/seed-*-i18n.ts` (164 scripts total) upsert strings. A fresh
  staging DB needs `prisma/seed.ts` translations **plus every i18n script** (the list in `deploy.sh`), or
  the UI shows keys instead of text.

## 6. External side effects and what touches them on staging

| Side effect | How it works today | Risk on staging |
|---|---|---|
| **E-mail** (parent e-mails, bulk participant mail, portal links/recovery, ticket orders, mail-helper status mails) | `src/lib/mail.ts` → Gmail API as a connected mailbox (OAuth refresh token in `MailSenderAccount`). Callers: `parent-email-send`, `participant-bulk-email`, `portal-email`, `portal-recovery`, `tickets-server`, `mail-bulk-status-send`. | A fresh staging DB has no connected mailboxes → sending fails. But if you connect a real mailbox on staging, it **can send to any address in staging data**. Needs a code-level recipient guard and invented addresses on a reserved domain (`*.example`/`.invalid`). |
| **Mail-helper inbox read** | `src/lib/mail-read.ts`, same OAuth tokens | Reads a real inbox if one is connected. |
| **Google Drive / Docs** (folders, document merge, participant folders, exports, drive-cleanup **which trashes files**) | `src/lib/drive.ts`: per-organisation connected Drive account (OAuth, `DriveAccount`) **or** impersonation of `bill-scanner-drive@` from the runtime SA. | `bill-scanner-drive@` has access to every production folder shared with it. If staging can impersonate it, any production folder/sheet ID typed into staging is writable. Staging needs its **own Drive SA** with only a test folder shared. |
| **Google Sheets** (participant sheet sync, mail status sheet export, planning sheet, bills/planning import) | Same Drive auth. Automatic sync: Cloud Scheduler `participant-sheet-sync` (hourly :23). | Scheduler jobs only target the prod URL — staging gets no cron unless we create it. Manual sync on staging is limited by which SA/folders it can reach (above). |
| **Cron** | Scheduler (europe-west3): `requeue-stuck-bills` (hourly), `participant-sheet-sync` (hourly), `exchange-rates-daily` (weekdays), `bank-check` (**every minute**, via `tabornik.online`). Routes `mail-drive-sync`, `mail-sheets-sync` exist but have no scheduler job. Protected by `CRON_SECRET`. | Don't create scheduler jobs for staging (or only `exchange-rates`). Staging needs a **different `CRON_SECRET`**. |
| **AI** (bill extraction, kitchen recipe) | App → Cloud Tasks queue `bill-ai-queue` (europe-west3, max 3 concurrent) → `${APP_BASE_URL}/api/tasks/process-bill-ai/:id` with `TASKS_SECRET` → `bill-scanner-ai` (europe-west1, invoker = compute SA + you) → Vertex/Gemini. **No usage cap in code.** | Shared queue would mix prod and staging tasks. Cost per extraction is small, but nothing limits volume. Separate queue with a low rate limit is the cap. |
| **GCS** | Bucket `bill-scanner-v2-files` (europe-west3, UBLA, 7-day soft delete). Signed URLs signed as the compute SA. | Runtime compute SA has **project-wide `roles/storage.admin`** → staging on that SA could read/delete production files. |
| **PDF** | `bill-scanner-pdf` with `PDF_SECRET`; stateless | Shareable. |
| **Bank (Fio)** | `src/lib/bank/fio-client.ts` with encrypted tokens (`BANK_TOKEN_ENC_KEY`) from DB; cron `bank-check` | Fresh DB has no tokens; use a different key so prod tokens can never be decrypted on staging. |
| **Third-party HTTP** | ČNB exchange rates, OpenStreetMap Nominatim + OSRM (travel distances) | Harmless, read-only public APIs. |
| **Public pages** (parent portal `/p/<token>`, public registration, tickets) | Unauthenticated by design; links built from `APP_BASE_URL`/`PUBLIC_BASE_URL`/`PORTAL_BASE_URL` or the organisation's public host | On staging these are reachable by anyone with the URL. With invented data that's low risk, but a public registration form could be used to trigger e-mails → recipient guard needed. |
| **Host handling** | `src/proxy.ts`: with `CANONICAL_HOST` set, any `*.run.app` request is **308-redirected to `https://tabornik.online`** | `CANONICAL_HOST` **must be unset** on staging, `APP_BASE_URL` must be the staging URL, `LB_IP` unset. |
| Webhooks | None found. | — |

## 7. Authentication

- Client: Firebase JS SDK, Google sign-in, auth domain `prvni-beh-filesaver.firebaseapp.com`.
- Server: `/api/session` verifies the ID token with `firebase-admin`, then requires an **active `User` row with
  that e-mail in an active organisation**; issues a 5-day `session` cookie. Every request re-checks the row.
- Firebase **authorized domains** today: localhost, firebaseapp/web.app, two Cloud Shell dev hosts, both prod
  `run.app` hosts, `tabornik.online`, `www.tabornik.online`.
- Consequence for staging: because the allowlist lives in the DB, a staging DB containing **only your user**
  (plus invented users with unusable `.invalid` e-mails) already means only you can sign in. The staging host
  must be added to Firebase authorized domains (that list is shared with prod; adding a domain is additive),
  or staging gets its own Firebase project (more isolation, more setup — compare in Round 2).
- Parent portal / public registration use token links + HMAC cookies with `PORTAL_SECRET`, no Firebase.
- Mail/Drive OAuth connect flow uses OAuth client `…nb9u6ov1….apps.googleusercontent.com`; its redirect URIs
  can't be listed via gcloud — if staging needs to connect a mailbox, its callback URI must be added in the
  Console (or a separate OAuth client used).

## 8. Environment variables and secrets

**Must differ on staging**

- `DATABASE_URL` (new secret, staging DB + staging-only user)
- `APP_BASE_URL` (staging URL), `CANONICAL_HOST` (**unset**), `LB_IP` (unset), `ADMIN_HOSTS` (optional)
- `GCS_BUCKET_NAME` (staging bucket)
- `DRIVE_SERVICE_ACCOUNT_EMAIL` (staging Drive SA)
- `CLOUD_TASKS_QUEUE` (staging queue)
- `CRON_SECRET`, `TASKS_SECRET`, `PORTAL_SECRET`, `MAIL_TOKEN_ENC_KEY`, `BANK_TOKEN_ENC_KEY` (new values, so
  nothing from prod can be replayed or decrypted on staging and vice versa)
- `GCS_SIGNING_SERVICE_ACCOUNT` (the staging runtime SA)
- New: an environment marker (e.g. `APP_ENV=staging`) for the banner and the mail guard
- Runtime service account (not an env var, but must differ)

**Can be shared**

- `NEXT_PUBLIC_FIREBASE_*` (if the same Firebase project is used), `GOOGLE_CLOUD_PROJECT`,
  `CLOUD_TASKS_LOCATION`, `AI_SERVICE_URL`, `PDF_SERVICE_URL` + `PDF_SECRET`,
  `MAIL_OAUTH_CLIENT_ID` / `MAIL_OAUTH_CLIENT_SECRET` (only if staging needs to connect a mailbox at all)

## 9. Other things that make staging unsafe or expensive

1. **Default compute SA is over-privileged and shared** by build, prod runtime, PDF and AI services:
   `run.admin` (can redeploy/delete prod), `storage.admin` (all buckets), `cloudsql.client`,
   `firebaseauth.admin`, `iam.serviceAccountUser`, `aiplatform.user`, token creator on the Drive SA.
   Staging must run as its own minimal SA — otherwise staging code is one bug away from prod files and services.
2. **Same Cloud SQL instance**: PostgreSQL grants `CONNECT` on every database to `PUBLIC` by default, so a
   staging DB user could connect to `billscanner` (it couldn't read app tables without grants, but it's a
   weaker boundary). Also db-f1-micro is shared-core with 0.6 GB RAM — staging load (migrations, seeds,
   imports) competes with prod.
3. **Manual builds from the working tree**: nothing stops a feature branch, or uncommitted edits, from going
   to production. Staging would make this worse if the same `deploy.sh` is reused by mistake.
4. **Migrations without a backup step**, PITR off, deletion protection off.
5. `bank-check` scheduler hits prod every minute (~43 k requests/month) — cheap with request billing, but don't
   copy it to staging.
6. Local dev runs against the production DB.
7. `prisma/seed.ts` contains real organisation addresses; a staging seed must not reuse it blindly.

## Risks (short list)

1. Staging on the default compute SA → read/write/delete prod GCS files, redeploy prod Cloud Run.
2. Staging able to impersonate `bill-scanner-drive@` → write/trash in production Drive folders and sheets.
3. Real mailbox connected on staging + any real-looking address → e-mail to a real person.
4. `CANONICAL_HOST` copied to staging → staging URL redirects to production.
5. Shared secrets (`TASKS_SECRET`, `CRON_SECRET`, `PORTAL_SECRET`, encryption keys) → cross-environment replay/decrypt.
6. Shared Cloud SQL instance → weaker isolation and resource contention on a micro instance.
7. Prod releases have no trigger, no backup-before-migrate and no PITR.

## Questions for you

1. **Production deploys**: there is no prod trigger today. Shall I keep prod exactly as is (manual
   `deploy.sh`), and only add a *staging* trigger — plus a small guard in `deploy.sh` that refuses to deploy
   to prod unless on a clean `master`? Or do you want prod to move to a `master`-only trigger later?
2. **GitHub → Cloud Build**: a trigger needs a Cloud Build connection to `github.com/1beh-ux/bill-scanner-app`
   (GitHub App install, done once by you in the browser). OK? Alternative: a `deploy-staging.sh` you run by hand,
   same as today's habit, no GitHub access needed.
3. **Firebase**: add the staging host to the existing project's authorized domains (simple), or create a
   separate Firebase project for staging (stronger isolation, separate API key)?
4. **Database**: separate database in `bill-scanner-db` (≈ €0 extra) vs a separate db-f1-micro instance
   (≈ €10–12/month, full isolation, can be stopped when idle). I'll compare in Round 2 — any preference?
5. **E-mail**: which one test address should all staging mail be redirected to? And do you want staging able
   to send at all (connected test mailbox), or simply blocked and logged?
6. **Drive/Sheets**: OK to create a dedicated staging Drive SA and a test folder in your own Drive shared only
   with it?
7. Are `bill-processor` and `bill-processor-fresh` (europe-west1) still in use? (Not needed for staging; just
   to know what not to touch.)
8. Separately from staging, should Round 2 include turning on **PITR** and **deletion protection** for
   `bill-scanner-db`? (Both change production config; PITR adds a few €/month of log storage.)
