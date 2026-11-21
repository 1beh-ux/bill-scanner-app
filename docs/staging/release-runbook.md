# Release runbook (staging → production)

Short, safe procedure for releasing a change that has been tested on staging. Project `prvni-beh-filesaver`,
region `europe-west3`, production service `bill-scanner-app`, production DB instance `bill-scanner-db`.

## 0. On staging first

1. Start the staging DB if it's stopped:
   `gcloud sql instances patch bill-scanner-staging-db --project=prvni-beh-filesaver --activation-policy=ALWAYS`
2. Push the branch (`fields-*` or `infra-*`). The trigger `staging-deploy` migrates the **staging** DB, replays the
   translation scripts and deploys `bill-scanner-app-staging`. (`./deploy-staging.sh` re-runs it for the pushed commit.)
   New translation script? Append its name to `scripts/staging/translation-scripts.txt`.
3. Test on https://bill-scanner-app-staging-1050716617948.europe-west3.run.app
4. Stop the staging DB when done:
   `gcloud sql instances patch bill-scanner-staging-db --project=prvni-beh-filesaver --activation-policy=NEVER`

## 1. Merge

Merge the branch into `master`, push, and in Cloud Shell: `git switch master && git pull`.
`~/claude-helpers/deploy.sh` refuses unless you are on a clean `master` equal to `origin/master`.

## 2. Backup the production DB (always, before migrating)

```bash
gcloud sql backups create --instance=bill-scanner-db --project=prvni-beh-filesaver \
  --description="before release $(git rev-parse --short HEAD)"
gcloud sql backups list --instance=bill-scanner-db --project=prvni-beh-filesaver --limit=1   # STATUS must be SUCCESSFUL
```

Note the current production revision (needed for rollback):

```bash
gcloud run services describe bill-scanner-app --region=europe-west3 --project=prvni-beh-filesaver \
  --format="value(status.traffic[0].revisionName)"
```

## 3. Deploy

**Normal release** (what you do today): `bash ~/claude-helpers/deploy.sh` — migrations, translation scripts,
then build + deploy with 100 % traffic to the new revision.

**Careful release** (new revision without traffic, then switch): only the last step differs. After
`deploy.sh`'s migrations (or with `cloudbuild.yaml` edited locally — don't commit), deploy with `--no-traffic --tag=candidate`:

```bash
# after the image is built (build ID from the Cloud Build output):
gcloud run deploy bill-scanner-app --project=prvni-beh-filesaver --region=europe-west3 \
  --image=europe-west3-docker.pkg.dev/prvni-beh-filesaver/bill-scanner-repo/app:<BUILD_ID> \
  --no-traffic --tag=candidate
# test the candidate at the tagged URL it prints (https://candidate---bill-scanner-app-....run.app), then:
gcloud run services update-traffic bill-scanner-app --project=prvni-beh-filesaver --region=europe-west3 --to-latest
```

Remember: migrations have already been applied when the candidate exists, so the *old* revision runs on the new
schema in the meantime. That's fine for additive migrations (new tables/columns); for renames or drops, split
the change into two releases (add first, remove later).

## 4. Roll back

**Code only** (schema change was additive) — instant, no rebuild:

```bash
gcloud run services update-traffic bill-scanner-app --project=prvni-beh-filesaver --region=europe-west3 \
  --to-revisions=<PREVIOUS_REVISION>=100
```

**Data/schema broken** — restore. This overwrites the whole production DB with the backup (everything written
since the backup is lost), so it's the last resort:

```bash
gcloud sql backups list --instance=bill-scanner-db --project=prvni-beh-filesaver --limit=5
gcloud sql backups restore <BACKUP_ID> --restore-instance=bill-scanner-db --project=prvni-beh-filesaver
```

With point-in-time recovery enabled you can instead clone to the moment just before the migration into a
**new** instance, check it, and switch over:

```bash
gcloud sql instances clone bill-scanner-db bill-scanner-db-restore --project=prvni-beh-filesaver \
  --point-in-time='2026-12-01T18:04:00Z'
```

Then roll back the code (above) to the revision matching that schema.

## 5. After

- Check https://tabornik.online loads and sign-in works; look at Cloud Run logs for errors for a few minutes.
- If staging is no longer needed today, stop the staging DB (step 0.4).
