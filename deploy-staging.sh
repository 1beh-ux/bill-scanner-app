#!/usr/bin/env bash
# Deploy the current branch to STAGING (docs/staging/plan.md) by running the Cloud Build trigger on the
# commit already pushed to GitHub -- never uploads the working tree, never touches production.
# Normally unnecessary: pushing a fields-* / infra-* branch triggers the same build.
set -euo pipefail
cd "$(dirname "$0")"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" =~ ^(fields|infra)- ]] || { echo "refusing: staging deploys only fields-* / infra-* branches (on '$BRANCH')"; exit 1; }
git fetch -q origin "$BRANCH" || { echo "branch '$BRANCH' is not on GitHub yet: git push -u origin $BRANCH"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] || echo "note: local HEAD differs from origin/$BRANCH -- deploying what is on GitHub"
STATE=$(gcloud sql instances describe bill-scanner-staging-db --project=prvni-beh-filesaver --format="value(settings.activationPolicy)")
[ "$STATE" = "ALWAYS" ] || { echo "staging DB is stopped -- start it first:"; echo "  gcloud sql instances patch bill-scanner-staging-db --project=prvni-beh-filesaver --activation-policy=ALWAYS"; exit 1; }
gcloud builds triggers run staging-deploy --project=prvni-beh-filesaver --region=europe-west3 --branch="$BRANCH"
echo "build started: https://console.cloud.google.com/cloud-build/builds;region=europe-west3?project=prvni-beh-filesaver"
