# Staging environment — Round 2 plan

Date: 2026-11-21. Based on `docs/staging/findings.md` and the decisions you made on the Round 1 questions.
**Nothing in this file has been run.** Round 3 runs it one group at a time, after your yes for each group.

All commands act on **GCP project `prvni-beh-filesaver`**, region **`europe-west3`** unless a line says
otherwise. Prices are approximate list prices (EUR, europe-west3) and rounded up.

## Decisions this plan implements

| # | Decision |
|---|---|
| 1 | Production stays manual (`~/claude-helpers/deploy.sh`); a guard makes it refuse anything but a clean `master` equal to `origin/master`. |
| 2 | Staging deploys from a Cloud Build trigger on GitHub pushes to `fields-*` / `infra-*`; `deploy-staging.sh` as a fallback. |
| 3 | Same Firebase project; the staging host is added to its authorized domains. |
| 4 | Separate Cloud SQL instance `bill-scanner-staging-db`, **stopped when idle**. |
| 5 | Same sender mailbox as production; on staging **every recipient is rewritten** to one redirect address in code; invented addresses use `.invalid`. |
| 6 | Dedicated staging Drive service account + test Shared Drive. |
| 7 | `bill-processor*` services untouched. |
| 8 | PITR + deletion protection on prod DB as a separate, approved step. |

## Names

| Thing | Name |
|---|---|
| Cloud Run service | `bill-scanner-app-staging` (europe-west3) |
| URL (`APP_BASE_URL`) | `https://bill-scanner-app-staging-1050716617948.europe-west3.run.app` (deterministic Cloud Run URL) |
| Cloud SQL instance / DB / user | `bill-scanner-staging-db` / `billscanner` / `staging_app` |
| Runtime SA | `bill-scanner-staging@prvni-beh-filesaver.iam.gserviceaccount.com` |
| Build SA | `staging-builder@prvni-beh-filesaver.iam.gserviceaccount.com` |
| Drive SA | `bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com` |
| Bucket | `gs://bill-scanner-v2-files-staging` |
| Tasks queue | `bill-ai-queue-staging` (europe-west3) |
| Artifact Registry repo | `bill-scanner-staging-repo` (europe-west3, keeps last 5 images) |
| Secrets | `staging-db-url`, `staging-cron-secret`, `staging-tasks-secret`, `staging-portal-secret`, `staging-mail-token-enc-key`, `staging-bank-token-enc-key` |
| Build connection / trigger | `staging-github` / `staging-deploy` (europe-west3) |
| Shared Drive (you create it) | `Tábornik STAGING` |

## Your next steps (things only you can do)

1. **Shared Drive for staging (question 6).** A service account has no Drive storage of its own, so it can't
   create files in a normal folder in My Drive ("Service Accounts do not have storage quota" — the app already
   recognises this error). It works in a **Shared Drive**, where files belong to the drive:
   - In Google Drive as `1beh@zare.cz`: *Shared drives → New → "Tábornik STAGING"*.
   - **After Round 3 group B creates the account**, add `bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com`
     as **Content manager**. Nothing else goes into that drive; the seed script fills it with invented test docs and sheets.
   - If the zare.cz Workspace doesn't allow shared drives or external members, tell me — the fallback is to
     leave Drive/Sheets switched off on staging.
   - **Never connect your own Google Drive account** on staging (Settings → Drive account): that would let
     staging write wherever you can, including production folders.
2. **GitHub authorisation (group E).** When I run `gcloud builds connections create github`, it prints a link;
   you open it, sign in to GitHub and install the Google Cloud Build app **on `1beh-ux/bill-scanner-app` only**.
3. **OAuth redirect URI (only if you want to send mail from staging).** Console → *APIs & Services →
   Credentials →* OAuth client `1050716617948-nb9u6ov1…` → *Authorized redirect URIs* → add
   `https://bill-scanner-app-staging-1050716617948.europe-west3.run.app/api/mail-oauth/callback`. Then connect
   the production sender mailbox on staging the normal way.
4. **Redirect address.** You said you don't mind about the sender. Where should redirected mail go? **Default
   if you don't say otherwise: back into the sender mailbox itself**, so nothing ever leaves your own account.
5. **One thing to know about using the production mailbox on staging**: the Mail Helper reads that mailbox's
   inbox, which contains real parents' mail — that would pull real personal data into staging. So the plan
   **blocks inbox reading on staging** in code (sending still works, redirected). If you want to test the Mail
   Helper inbox on staging later, it needs a separate test Gmail.

## Group A — staging database (Cloud SQL)

Acts on: new instance `bill-scanner-staging-db` only. Production instance untouched.
Cost: db-f1-micro ≈ €9/month while running + 10 GB SSD ≈ €2/month always. Stopped: ≈ €2/month. No backups
(the data is invented and re-seedable).

```bash
gcloud sql instances create bill-scanner-staging-db --project=prvni-beh-filesaver \
  --region=europe-west3 --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro \
  --storage-type=SSD --storage-size=10 --availability-type=zonal --no-backup \
  --assign-ip   # public IP, no authorized networks -> only the Cloud SQL connector can connect (same as prod)
gcloud sql databases create billscanner --instance=bill-scanner-staging-db --project=prvni-beh-filesaver
PW=$(openssl rand -base64 30 | tr -d '/+=')        # never printed
gcloud sql users create staging_app --instance=bill-scanner-staging-db --project=prvni-beh-filesaver --password="$PW"
printf 'postgresql://staging_app:%s@/billscanner?host=/cloudsql/prvni-beh-filesaver:europe-west3:bill-scanner-staging-db' "$PW" \
  | gcloud secrets create staging-db-url --project=prvni-beh-filesaver --replication-policy=user-managed --locations=europe-west3 --data-file=-
unset PW
```

Stop / start (also in memory, I'll do this around staging work):

```bash
gcloud sql instances patch bill-scanner-staging-db --project=prvni-beh-filesaver --activation-policy=NEVER   # stop
gcloud sql instances patch bill-scanner-staging-db --project=prvni-beh-filesaver --activation-policy=ALWAYS  # start
```

Verify: `gcloud sql instances describe bill-scanner-staging-db --format="value(state,settings.tier)"`;
`gcloud sql databases list --instance=bill-scanner-staging-db`.

## Group B — service accounts, secrets, bucket, queue, image repo

Acts on: new resources only, plus **additive** IAM bindings on two production services (`run.invoker` on
`bill-scanner-ai` and `bill-scanner-pdf` for the staging runtime SA) and on two existing secrets
(`pdf-secret`, `mail-oauth-client-secret` — read access for the staging runtime SA). Nothing is removed from
production. Cost: secrets 6 × €0.06; bucket, queue and repo cents per month.

```bash
P=prvni-beh-filesaver; R=europe-west3
RT=bill-scanner-staging@$P.iam.gserviceaccount.com
DS=bill-scanner-drive-staging@$P.iam.gserviceaccount.com

# Service accounts (no project-wide roles)
gcloud iam service-accounts create bill-scanner-staging       --project=$P --display-name="Staging runtime"
gcloud iam service-accounts create bill-scanner-drive-staging --project=$P --display-name="Staging Drive (test Shared Drive only)"
gcloud iam service-accounts create staging-builder            --project=$P --display-name="Staging Cloud Build"

# New secrets: fresh random values, never printed. Encryption keys are 32 random bytes, base64 (what the code requires).
for s in staging-cron-secret staging-tasks-secret staging-portal-secret; do
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets create $s --project=$P --replication-policy=user-managed --locations=$R --data-file=-; done
for s in staging-mail-token-enc-key staging-bank-token-enc-key; do
  openssl rand -base64 32 | tr -d '\n' | gcloud secrets create $s --project=$P --replication-policy=user-managed --locations=$R --data-file=-; done

# Runtime SA may read exactly these secrets (6 staging + 2 shared)
for s in staging-db-url staging-cron-secret staging-tasks-secret staging-portal-secret staging-mail-token-enc-key staging-bank-token-enc-key pdf-secret mail-oauth-client-secret; do
  gcloud secrets add-iam-policy-binding $s --project=$P --member=serviceAccount:$RT --role=roles/secretmanager.secretAccessor; done

# Cloud SQL: client role limited by IAM condition to the staging instance
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$RT --role=roles/cloudsql.client \
  --condition='title=staging-db-only,expression=resource.name == "projects/prvni-beh-filesaver/instances/bill-scanner-staging-db"'

# Bucket: private, 30-day auto-delete, no soft-delete; runtime SA gets object admin on THIS bucket only
gcloud storage buckets create gs://bill-scanner-v2-files-staging --project=$P --location=$R \
  --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lc.json
gcloud storage buckets update gs://bill-scanner-v2-files-staging --lifecycle-file=/tmp/lc.json
gcloud storage buckets add-iam-policy-binding gs://bill-scanner-v2-files-staging --member=serviceAccount:$RT --role=roles/storage.objectAdmin
# Signed URLs are signed as the runtime SA itself
gcloud iam service-accounts add-iam-policy-binding $RT --project=$P --member=serviceAccount:$RT --role=roles/iam.serviceAccountTokenCreator

# Drive: runtime SA may impersonate ONLY the staging Drive SA (not bill-scanner-drive@)
gcloud iam service-accounts add-iam-policy-binding $DS --project=$P --member=serviceAccount:$RT --role=roles/iam.serviceAccountTokenCreator

# AI queue: low rate = the AI cost cap (≤ 1 bill every 10 s, 1 at a time, 3 attempts)
gcloud tasks queues create bill-ai-queue-staging --project=$P --location=$R \
  --max-concurrent-dispatches=1 --max-dispatches-per-second=0.1 --max-attempts=3
gcloud tasks queues add-iam-policy-binding bill-ai-queue-staging --project=$P --location=$R --member=serviceAccount:$RT --role=roles/cloudtasks.enqueuer

# Calling the shared AI and PDF services (additive binding on production services)
gcloud run services add-iam-policy-binding bill-scanner-ai  --project=$P --region=europe-west1 --member=serviceAccount:$RT --role=roles/run.invoker
gcloud run services add-iam-policy-binding bill-scanner-pdf --project=$P --region=$R          --member=serviceAccount:$RT --role=roles/run.invoker

# Firebase: only what sign-in needs (verify + create session cookie), as a custom role instead of firebaseauth.admin
gcloud iam roles create stagingFirebaseSession --project=$P --title="Staging Firebase session" \
  --permissions=firebaseauth.users.createSession,firebaseauth.users.get
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$RT --role=projects/$P/roles/stagingFirebaseSession --condition=None

# Separate image repo, keeps the newest 5 images
gcloud artifacts repositories create bill-scanner-staging-repo --project=$P --location=$R --repository-format=docker
cat > /tmp/keep5.json <<'EOF'
[{"name":"keep-5","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"ANY"}}]
EOF
gcloud artifacts repositories set-cleanup-policies bill-scanner-staging-repo --project=$P --location=$R --policy=/tmp/keep5.json --no-dry-run
```

Verify: list the three SAs; `gcloud projects get-iam-policy` filtered on each SA shows only the conditional
Cloud SQL role and the custom Firebase role; bucket/queue/repo describe.

## Group C — first staging deploy (Cloud Run)

Acts on: new service `bill-scanner-app-staging` only. Production `bill-scanner-app` untouched (I record its
revision `bill-scanner-app-00163-r7v` before and after). Cost: request-billed, min 0 instances → ≈ €0–1/month.

New file **`cloudbuild.staging.yaml`** (production `cloudbuild.yaml` is not touched). Steps:
1. `npm ci` (node:20).
2. Migrations + translations against the **staging** DB: download `cloud-sql-proxy`, start it for
   `bill-scanner-staging-db`, read `staging-db-url` from Secret Manager, run `npx prisma migrate deploy`, then
   every script in `scripts/i18n-seeds.txt` (see group D). The step **aborts unless the URL names
   `bill-scanner-staging-db`**.
3. `docker build` (same Dockerfile, same Firebase build args) → `europe-west3-docker.pkg.dev/$PROJECT_ID/bill-scanner-staging-repo/app:$SHORT_SHA`.
4. Push.
5. Deploy:

```bash
gcloud run deploy bill-scanner-app-staging \
  --image=europe-west3-docker.pkg.dev/prvni-beh-filesaver/bill-scanner-staging-repo/app:$SHORT_SHA \
  --region=europe-west3 --platform=managed \
  --service-account=bill-scanner-staging@prvni-beh-filesaver.iam.gserviceaccount.com \
  --no-invoker-iam-check \
  --add-cloudsql-instances=prvni-beh-filesaver:europe-west3:bill-scanner-staging-db \
  --set-secrets=DATABASE_URL=staging-db-url:latest,CRON_SECRET=staging-cron-secret:latest,TASKS_SECRET=staging-tasks-secret:latest,PORTAL_SECRET=staging-portal-secret:latest,MAIL_TOKEN_ENC_KEY=staging-mail-token-enc-key:latest,BANK_TOKEN_ENC_KEY=staging-bank-token-enc-key:latest,PDF_SECRET=pdf-secret:latest,MAIL_OAUTH_CLIENT_SECRET=mail-oauth-client-secret:latest \
  --set-env-vars=APP_ENV=staging,STAGING_MAIL_REDIRECT=<address from step 4>,APP_BASE_URL=https://bill-scanner-app-staging-1050716617948.europe-west3.run.app,GCS_BUCKET_NAME=bill-scanner-v2-files-staging,GCS_SIGNING_SERVICE_ACCOUNT=bill-scanner-staging@prvni-beh-filesaver.iam.gserviceaccount.com,DRIVE_SERVICE_ACCOUNT_EMAIL=bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com,CLOUD_TASKS_QUEUE=bill-ai-queue-staging,CLOUD_TASKS_LOCATION=europe-west3,GOOGLE_CLOUD_PROJECT=prvni-beh-filesaver,AI_SERVICE_URL=https://bill-scanner-ai-sml4zhisya-ew.a.run.app,PDF_SERVICE_URL=https://bill-scanner-pdf-1050716617948.europe-west3.run.app,MAIL_OAUTH_CLIENT_ID=1050716617948-nb9u6ov1v9gj3k29kfoiu3rf7ngqv6bj.apps.googleusercontent.com \
  --cpu=1 --memory=2Gi --timeout=600 --min-instances=0 --max-instances=1 --cpu-throttling
```

`--set-secrets` / `--set-env-vars` (not `--update-…`) so the service has exactly this list.
**Deliberately absent:** `CANONICAL_HOST` (would redirect staging to tabornik.online), `LB_IP`.
Same flags as production where they matter: `--cpu-throttling`, `--timeout=600`, `--cpu=1`, `--no-invoker-iam-check`.

The very first deploy (before the trigger exists) runs the same file from Cloud Shell with
`deploy-staging.sh` (new, in the repo): `gcloud builds submit --config=cloudbuild.staging.yaml
--service-account=projects/prvni-beh-filesaver/serviceAccounts/staging-builder@… .` — refuses to start
unless the branch matches `fields-*`/`infra-*`.

Firebase authorized domain (shared project; adding is additive, existing domains are kept):
Console → *Authentication → Settings → Authorized domains → Add* `bill-scanner-app-staging-1050716617948.europe-west3.run.app`
(you can click it, or I do it through the Identity Toolkit API with the full current list + the new one).

Verify: URL answers, shows the staging banner; `/login` with your account works; prod revision unchanged.

## Group D — code changes (small, all gated on `APP_ENV=staging`)

Production never sets `APP_ENV`, so production behaviour does not change.

| File | Change |
|---|---|
| `src/lib/app-env.ts` (new) | `isStaging()` = `process.env.APP_ENV === "staging"`. |
| `src/app/layout.tsx` | On staging: fixed bar at the top **"STAGING — testovací prostředí, smyšlená data · test environment, invented data"** (bilingual, hard-coded so it works on an empty DB), contrasting colour; page title prefixed `[STAGING]`. |
| `src/proxy.ts` | On staging: `X-Robots-Tag: noindex, nofollow` on every response (keeps public test pages out of search engines). |
| `src/lib/mail.ts` | On staging: `To:` is replaced by `STAGING_MAIL_REDIRECT`, subject prefixed `[STAGING → original@address]`. If `STAGING_MAIL_REDIRECT` is unset, sending throws (blocked). Mail has no Cc/Bcc today (checked), only `To:`. |
| `src/lib/mail-read.ts` | On staging: inbox listing/reading throws a clear "disabled on staging" error (see your next steps, point 5). |
| `scripts/i18n-seeds.txt` (new) | The list of translation scripts, copied from `deploy.sh`, used by the staging build. |
| `cloudbuild.staging.yaml`, `deploy-staging.sh` (new) | See group C. |
| `scripts/staging/seed-staging.ts` (new) | See group F. |
| `~/claude-helpers/deploy.sh` (outside the repo) | Prod guard, top of file: refuse unless branch is `master`, no tracked changes except `AGENTS.md` (which `next dev` rewrites), and `HEAD == origin/master` after `git fetch`. Also read the seed list from `scripts/i18n-seeds.txt` so prod and staging run the same seeds. |

Verify: `npx tsc --noEmit`, lint; on staging the banner shows; locally without `APP_ENV` nothing changes.

## Group E — Cloud Build trigger

Acts on: new connection, repository link, trigger, and IAM for `staging-builder`. The connection creates
one secret (the GitHub token) automatically. Cost: Cloud Build's first 2,500 build-minutes/month are free;
a build is ≈ 8–10 min, so normal use is €0.

```bash
P=prvni-beh-filesaver; R=europe-west3; B=staging-builder@$P.iam.gserviceaccount.com
# Cloud Build's service agent must be able to store the GitHub token
gcloud projects add-iam-policy-binding $P --member=serviceAccount:service-1050716617948@gcp-sa-cloudbuild.iam.gserviceaccount.com --role=roles/secretmanager.admin
gcloud builds connections create github staging-github --project=$P --region=$R     # -> you open the printed link (your step 2)
gcloud builds repositories create bill-scanner-app --project=$P --region=$R --connection=staging-github \
  --remote-uri=https://github.com/1beh-ux/bill-scanner-app.git

# What the builder may do — staging only
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$B --role=roles/logging.logWriter --condition=None
gcloud artifacts repositories add-iam-policy-binding bill-scanner-staging-repo --project=$P --location=$R --member=serviceAccount:$B --role=roles/artifactregistry.writer
gcloud run services add-iam-policy-binding bill-scanner-app-staging --project=$P --region=$R --member=serviceAccount:$B --role=roles/run.developer
gcloud iam service-accounts add-iam-policy-binding bill-scanner-staging@$P.iam.gserviceaccount.com --project=$P --member=serviceAccount:$B --role=roles/iam.serviceAccountUser
gcloud secrets add-iam-policy-binding staging-db-url --project=$P --member=serviceAccount:$B --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$B --role=roles/cloudsql.client \
  --condition='title=staging-db-only,expression=resource.name == "projects/prvni-beh-filesaver/instances/bill-scanner-staging-db"'

# The trigger: only fields-* and infra-* branches; master can never match
gcloud builds triggers create github --name=staging-deploy --project=$P --region=$R \
  --repository=projects/$P/locations/$R/connections/staging-github/repositories/bill-scanner-app \
  --branch-pattern='^(fields|infra)-.*$' --build-config=cloudbuild.staging.yaml \
  --service-account=projects/$P/serviceAccounts/$B \
  --substitutions=_FIREBASE_API_KEY=<same as prod>,_FIREBASE_AUTH_DOMAIN=prvni-beh-filesaver.firebaseapp.com,_FIREBASE_PROJECT_ID=prvni-beh-filesaver,_FIREBASE_APP_ID=1:1050716617948:web:a1acc96daddf0985da4819
```

The builder has **no** rights on `bill-scanner-app`, `bill-scanner-repo`, `db-url-secret` or the production
instance, so even a broken `cloudbuild.staging.yaml` cannot deploy to production. Production deploys remain
your manual `deploy.sh` and are not affected by the trigger.

Verify: push a trivial commit to `infra-staging` → build runs in europe-west3 → new staging revision; prod
revision unchanged.

## Group F — seed script and test Drive/Sheets resources

`scripts/staging/seed-staging.ts`, run from Cloud Shell through a proxy to the staging instance (port 55440,
never the prod ports 55433/55434). **Refuses to run** unless: `APP_ENV=staging` is set, the connection goes to
`bill-scanner-staging-db` (checked with `gcloud sql` instance name passed explicitly and the database's
marker table), and the DB has no organisation other than the seeded one. Re-runnable (wipes and re-creates
its own data).

Invented data only (Czech-looking but made-up names, all e-mails `@example.invalid`, phone numbers in an
unassigned range, no real dates of birth tied to real people):

- 1 organisation "Testovací oddíl (STAGING)", you as its admin (your sign-in address) — the only user able to sign in; 2 invented users with `.invalid` addresses for role tests.
- 4 events: a past summer camp, a current camp, a weekend trip, and one **public registration event** with a public address.
- ~30 children with guardians: some with two guardians, one with no guardian e-mail, 3 exact duplicates and 3 near-duplicates (typo in surname, swapped first/last name, different date format).
- Participant fields of every type: `text`, `number`, `date`, `boolean`, `select`, `image`, `composite`, on several surfaces/levels.
- Health notes, documents and registrations in a few states, invented.
- In the Shared Drive `Tábornik STAGING` (created by the staging Drive SA via Docs/Sheets API, so it's reproducible): an event folder, 2 invented document templates (Google Docs with merge fields), and 3 sample sheets for import tests (clean, with duplicates, with bad rows).
- Translations: `prisma/seed.ts`'s translation part + every script in `scripts/i18n-seeds.txt`. `prisma/seed.ts`'s users (real organisation addresses) are **not** used.

Verify: counts per table printed (no names); a query proving no prod identifiers exist (e.g. no e-mail not
ending in `.invalid` except yours; no Drive IDs outside the Shared Drive).

## Separate step G — production DB safety (decision 8)

Acts on **production instance `bill-scanner-db`** (config only, no data). I could not confirm from the docs
here whether enabling PITR restarts a PostgreSQL instance, so treat it as a possible ~1-minute restart and run
it in a quiet hour (e.g. evening). Deletion protection is a flag change with no restart.

```bash
gcloud sql instances patch bill-scanner-db --project=prvni-beh-filesaver --deletion-protection
gcloud sql instances patch bill-scanner-db --project=prvni-beh-filesaver --enable-point-in-time-recovery --retained-transaction-log-days=7
```

Cost: transaction logs ≈ €1–3/month. Deletion protection: free.

## Cost per month (approx.)

| Item | Running | Staging DB stopped |
|---|---|---|
| Cloud SQL db-f1-micro + 10 GB SSD | €11 | €2 |
| Cloud Run staging (min 0, request-billed) | €0–1 | €0 |
| Secrets (6 new) | €0.40 | €0.40 |
| Artifact Registry (≤ 5 images) | €0.20 | €0.20 |
| Bucket, queue, Cloud Build | ≈ €0 | €0 |
| AI calls (capped by queue rate) | €0–2 | €0 |
| **Staging total** | **≈ €13–15** | **≈ €3** |
| PITR on prod (step G) | €1–3 | €1–3 |

**Switching staging off**: stop the DB (command in group A). Cloud Run scales to zero by itself. Optionally
`gcloud builds triggers update staging-deploy --region=europe-west3 --disabled` so pushes don't build.

## Rollback of the whole setup (reverse order)

```bash
P=prvni-beh-filesaver; R=europe-west3
gcloud builds triggers delete staging-deploy --project=$P --region=$R
gcloud builds repositories delete bill-scanner-app --connection=staging-github --project=$P --region=$R
gcloud builds connections delete staging-github --project=$P --region=$R     # + uninstall the GitHub app in GitHub settings
gcloud run services delete bill-scanner-app-staging --project=$P --region=$R
gcloud run services remove-iam-policy-binding bill-scanner-ai  --region=europe-west1 --project=$P --member=serviceAccount:bill-scanner-staging@$P.iam.gserviceaccount.com --role=roles/run.invoker
gcloud run services remove-iam-policy-binding bill-scanner-pdf --region=$R          --project=$P --member=serviceAccount:bill-scanner-staging@$P.iam.gserviceaccount.com --role=roles/run.invoker
for s in pdf-secret mail-oauth-client-secret; do gcloud secrets remove-iam-policy-binding $s --project=$P --member=serviceAccount:bill-scanner-staging@$P.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor; done
gcloud projects remove-iam-policy-binding $P ...   # each conditional/custom binding added in B and E
gcloud iam roles delete stagingFirebaseSession --project=$P
gcloud tasks queues delete bill-ai-queue-staging --project=$P --location=$R
gcloud storage rm -r gs://bill-scanner-v2-files-staging
gcloud artifacts repositories delete bill-scanner-staging-repo --project=$P --location=$R
for s in staging-db-url staging-cron-secret staging-tasks-secret staging-portal-secret staging-mail-token-enc-key staging-bank-token-enc-key; do gcloud secrets delete $s --project=$P; done
gcloud sql instances delete bill-scanner-staging-db --project=$P
for a in bill-scanner-staging bill-scanner-drive-staging staging-builder; do gcloud iam service-accounts delete $a@$P.iam.gserviceaccount.com --project=$P; done
```

Plus: remove the staging domain from Firebase authorized domains and the redirect URI from the OAuth client;
delete the Shared Drive; `git revert` the code commits (all gated on `APP_ENV`, so leaving them is harmless).

## Notes found while planning (not part of staging, for later)

- `gcloud builds submit` has no `.gcloudignore`, so it uploads everything not in `.gitignore` — including
  untracked `docs/` (≈ 10 MB, `help-pack.zip`) and `export/fields-inventory.*` — to the build bucket
  `prvni-beh-filesaver_cloudbuild` (**US** location), and `COPY . .` puts them in the image. If `export/`
  contains anything derived from production data, that's worth fixing with a `.gcloudignore`. The staging
  trigger builds from git only, so it's not affected.
- `~/deploy-planning.sh`, `~/deploy-registration.sh`, `~/deploy-kitchen.sh` are older one-offs that also
  deploy to production without the guard; I suggest deleting them or adding the same guard.
