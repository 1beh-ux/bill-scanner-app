# Staging environment — Round 4 verification

Date: 2026-11-21. Everything below was checked with commands run in this session; outputs are quoted (counts and
names only, no personal data). Plan: `docs/staging/plan.md`. Release procedure: `docs/staging/release-runbook.md`.

## 1. Own URL, service and database; production unchanged

| | Staging | Production |
|---|---|---|
| URL | https://bill-scanner-app-staging-1050716617948.europe-west3.run.app | https://tabornik.online |
| Cloud Run service | `bill-scanner-app-staging` (rev. `bill-scanner-app-staging-00002-nzk`) | `bill-scanner-app` |
| Runtime SA | `bill-scanner-staging@` | default compute SA |
| Cloud SQL | `bill-scanner-staging-db` / `billscanner` / user `staging_app` | `bill-scanner-db` |
| Image repo | `bill-scanner-staging-repo` | `bill-scanner-repo` |
| Bucket / queue | `bill-scanner-v2-files-staging` / `bill-ai-queue-staging` | `bill-scanner-v2-files` / `bill-ai-queue` |

- Production revision **before** (Round 1 and start of Round 3): `bill-scanner-app-00163-r7v`, 100 %.
  **After** all of Round 3: `bill-scanner-app-00163-r7v`, 100 %. `https://tabornik.online/login` → 200.
- Staging service: `APP_ENV=staging`, `CANONICAL_HOST` **not set**, max 1 instance, `--cpu-throttling`,
  Cloud SQL `…:bill-scanner-staging-db` only; secrets `staging-*` plus the shared `pdf-secret`,
  `mail-oauth-client-secret`.
- `/login` on staging → 200 with header `x-robots-tag: noindex, nofollow`, the bar
  "STAGING — testovací prostředí, smyšlená data · test environment, invented data" and title `[STAGING] tabornik.online`.
  Production sends no `x-robots-tag`.

Isolation, checked on production resources (number of bindings mentioning a staging principal):
production bucket 0, production Cloud Run service 0, `db-url-secret` 0, production Drive SA `bill-scanner-drive@` 0,
production image repo 0; `staging_app` user on the production instance: 0.
Project-level roles of staging principals: runtime SA = `cloudsql.client` (condition: staging instance only) +
custom `stagingFirebaseSession` (`firebaseauth.users.createSession`, `firebaseauth.users.get`); builder =
`cloudsql.client` (staging instance only) + `logging.logWriter`. The Drive SA has none.

## 2. Staging data is invented only

`scripts/staging/seed-staging.ts` refuses to run unless `APP_ENV=staging`, the URL is the staging proxy
(`127.0.0.1:55440`), and the DB is empty or carries the `staging_marker` row (production has data and no marker).

Counts after seeding: 1 organization, 3 users, 4 events, 30 people (24 + 3 exact duplicates + 3 near-duplicates;
one guardian without e-mail), 39 guardians, 55 participations, 19 field templates (all 7 types), 81 event fields,
4,768 translations (production 4,770 — see open items).

`scripts/staging/check-counts.ts` (addresses not ending in `.invalid`, other than the owner's sign-in address):
users 0, child guardians 0, participant guardians 0, organizations 0.
No production Drive ID is stored in staging: the only Drive IDs in staging are the ones `seed-staging-drive.ts`
created in the staging folder.

## 3. Only your Google account can sign in

Sign-in requires an active `User` row (`src/app/api/session/route.ts`). Staging users: the owner (`1beh@zare.cz`,
super-admin) and two invented `@example.invalid` users, which no Google account can have. Every other address
gets 403 "Not allowlisted". Firebase authorized domains: 10 (the 9 production ones + the staging host).
**To confirm yourself:** sign in on the staging URL with your account (should work), and with any other Google
account (should be refused).

## 4. No e-mail leaves staging

`src/lib/mail.ts` → `stagingMailRewrite` (`src/lib/app-env.ts`); both send functions pass through it, and
those are the only Gmail send paths besides Mail Helper reply, which is blocked on staging together with all inbox
reads (`src/lib/mail-read.ts`, error `mail_inbox_disabled_on_staging`). Direct check of the rewrite:

```
production: {"to":"rodic@example.invalid","subject":"Přihláška",...}
staging:    {"to":"sender@example.invalid","subject":"[STAGING → rodic@example.invalid] Přihláška",...}
```

So on staging every message goes back into the sending mailbox, with the intended recipient in the subject.
Staging has no connected mailbox yet (fresh DB), so nothing can be sent until you connect one.
**To confirm live:** on staging, connect the sender mailbox (event → Pošta), send any e-mail to an invented
participant; it arrives in that same mailbox with `[STAGING → …]` in the subject.

## 5. Drive and Sheets touch only test resources; no automatic syncs

- Staging uses `DRIVE_SERVICE_ACCOUNT_EMAIL=bill-scanner-drive-staging@`; the runtime SA can impersonate only that
  account (production `bill-scanner-drive@`'s token-creator list is unchanged: compute SA + you).
- That account sees exactly one thing: the folder "Táborník STAGING" you shared. It holds `Testovací oddíl/` with
  7 subfolders, 2 invented Doc templates (`Šablony/`) and 3 invented import sheets (`Import/`: clean, with
  duplicates, with bad rows). The 2027 camp event points at these folders and the clean sheet.
- **13 production Drive folder/sheet IDs** (read from production events, not printed) opened as the staging Drive
  account: **13 × HTTP 404.**
- Cloud Scheduler: the 4 jobs all target production URLs; none exists for staging, so no automatic sheet sync,
  bank check or requeue runs on staging. Calling a staging cron route without the staging `CRON_SECRET` is refused.

## 6. Pushing a branch deploys to staging only

- Trigger `staging-deploy` (europe-west3): branch regex `^(fields|infra)-.*$`, config `cloudbuild.staging.yaml`,
  runs as `staging-builder@`, which has no permission on the production service, repo, DB secret or instance.
  `master` can't match the regex.
- First build `dcccfa74…` (run through `./deploy-staging.sh`): deps ✓, db ✓ ("No pending migrations to apply",
  "translation scripts done, 0 failed"), build ✓, push ✓, deploy ✓ → `bill-scanner-app-staging-00002-nzk`.
- Push of this document's commit: see the "push test" line at the end.
- Production: unchanged procedure — `bash ~/claude-helpers/deploy.sh` on `master` (no trigger exists for
  production). The new guard refuses anything but a clean `master` equal to `origin/master`; tested on
  `infra-staging` → "REFUSING prod deploy: not on master (on infra-staging)". Not triggered.

## 7. Migrations on staging; production procedure

All 131 migrations applied to the staging DB (from Cloud Shell first, then the trigger build confirmed
"No pending migrations"). The production procedure — backup, deploy, traffic switch, rollback — is in
`docs/staging/release-runbook.md`.

## Production DB safety (step G)

- Deletion protection on `bill-scanner-db`: **enabled** 2026-11-21 (state stayed RUNNABLE).
- Point-in-time recovery: **enabled** 2026-11-21 22:12–22:18 UTC (7 days of transaction logs; the scheduled run did not fire because the session had closed, so it was run by hand the same night). State stayed RUNNABLE; tabornik.online answered 200 throughout.

## Everything created (project `prvni-beh-filesaver`)

| Resource | Name | Region | ≈ cost / month |
|---|---|---|---|
| Cloud SQL instance (db-f1-micro, 10 GB SSD, no backups) | `bill-scanner-staging-db` | europe-west3-a | €11 running / €2 stopped |
| Cloud Run service (min 0, max 1) | `bill-scanner-app-staging` | europe-west3 | €0–1 |
| Service accounts | `bill-scanner-staging@`, `bill-scanner-drive-staging@`, `staging-builder@` | — | 0 |
| Custom IAM role | `stagingFirebaseSession` | — | 0 |
| Secrets | `staging-db-url`, `staging-cron-secret`, `staging-tasks-secret`, `staging-portal-secret`, `staging-mail-token-enc-key`, `staging-bank-token-enc-key` (+ the GitHub token secret created by the connection) | europe-west3 | €0.40 |
| Bucket (30-day delete) | `bill-scanner-v2-files-staging` | europe-west3 | ≈ 0 |
| Cloud Tasks queue (1 concurrent, 0.1/s) | `bill-ai-queue-staging` | europe-west3 | ≈ 0 |
| Artifact Registry (keeps 5) | `bill-scanner-staging-repo` | europe-west3 | €0.20 |
| Cloud Build connection / repo / trigger | `staging-github` / `bill-scanner-app` / `staging-deploy` | europe-west3 | 0 (free tier) |
| IAM additions on existing resources | run.invoker on `bill-scanner-ai`, `bill-scanner-pdf`; secretAccessor on `pdf-secret`, `mail-oauth-client-secret`; Cloud Build agent secretmanager.admin; you: tokenCreator on the staging Drive SA | — | 0 |
| Firebase | staging host in authorized domains | — | 0 |
| Drive | folder "Táborník STAGING" (yours) with test files | — | 0 |
| Production config | deletion protection on `bill-scanner-db`; PITR (tonight) | — | PITR €1–3 |

Code (branch `infra-staging`): `src/lib/app-env.ts`, `src/lib/mail.ts`, `src/lib/mail-read.ts`,
`src/app/layout.tsx`, `src/proxy.ts`, `cloudbuild.staging.yaml`, `deploy-staging.sh`, `scripts/staging/*`.
Outside the repo: guard in `~/claude-helpers/deploy.sh` (original kept as `deploy.sh.before-staging-guard`).

## Check yourself in the GCP Console

1. Cloud Run → `bill-scanner-app-staging` → Security tab shows `bill-scanner-staging@`; `bill-scanner-app` still on `00163-r7v`.
2. IAM → filter "staging": only the roles listed in §1.
3. Cloud Build → Triggers (region europe-west3) → `staging-deploy`; History shows the staging builds only.
4. SQL → `bill-scanner-db` → Data protection: deletion protection on; after tonight, PITR on.
5. Firebase → Authentication → Settings → Authorized domains: the staging host present, the rest unchanged.
6. Sign in on the staging URL (and try another Google account — refused).

## Still open → resolved 2026-11-21 (after your checks 1–3 passed)

- **Two translation keys only in production** (`planBoard.dayMenu`, `statusUpdate.variant`): not referenced anywhere
  in `src/` — leftovers in the production table. Nothing on staging is missing; no fix needed.
- **Document-merge templates**: now linked automatically. `seed-staging-drive.ts` creates two document types on the
  2027 camp ("Potvrzení o přihlášce", "Bezinfekčnost") pointing at the test Docs, and fixed their placeholders to the
  app's real keys (`{{participant_first_name}}`, `{{participant_last_name}}`; `{{datum_narozeni}}`, `{{adresa}}`,
  `{{tricko}}`, `{{poznamka}}` were already right).
- **Production build upload**: new `.gcloudignore` = git's ignore rules + root `docs/`, `export/`, `Claude outputs/`,
  `*.tsbuildinfo`. Upload list: 1,285 files / 23 MB → 1,204 files / 12 MB; removed only those root folders, added
  nothing; `content/help` (29), `src/` (798 — incl. the three `api/**/export/` routes), `prisma/`, `Dockerfile`
  still present; no `.env*`. `export/` was checked first: definitions and counts only, no e-mail addresses.
  Takes effect for production when this branch is merged into `master`.
- **Old one-off deploy scripts** `~/deploy-planning.sh`, `~/deploy-registration.sh`, `~/deploy-kitchen.sh`: now
  print "RETIRED …" and exit 1 (line 2 of each; delete those two lines to undo).
- Live e-mail test: your step, unchanged (§4).
- The staging DB costs money while running: stop it when not testing (command in the runbook).

**Push test:** pushing commit `64c20cb` to `infra-staging` started staging build `f9cbc971` automatically
(trigger `staging-deploy`, 17:09:51 UTC). The latest production (global) build is still 2026-11-12 13:33 UTC — no
production build was created.
