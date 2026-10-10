# Custom domain: tabornik.online

## Target setup

```
https://tabornik.online
  -> global external Application Load Balancer (Google-managed certificate)
  -> serverless NEG (europe-west3)
  -> Cloud Run service bill-scanner-app
```

The run.app URL (`https://bill-scanner-app-sml4zhisya-ey.a.run.app`) stays live.
Cloud Scheduler (/api/cron), Firebase's sign-in helper (/__/) and old links keep working there.

## Env vars (cloudbuild.yaml `--update-env-vars`)

| Var | Value | What reads it |
|---|---|---|
| `APP_BASE_URL` | `https://tabornik.online` | mail OAuth redirect URI (`src/app/api/mail-oauth/authorize/route.ts`), Cloud Tasks target URL (`src/lib/cloud-tasks.ts`), fallback for public links |
| `CANONICAL_HOST` | `tabornik.online` (not set yet) | `src/proxy.ts`: 308 from `*.run.app` to this host for GET/HEAD, except `/api/tasks`, `/api/cron`, `/__/`. Unset = no redirect |
| `PUBLIC_BASE_URL` / `PORTAL_BASE_URL` | not set yet | `publicBaseUrl()` in `src/lib/portal-gate.ts`: base for `/r/<slug>` and `/p/<token>` links. Order: PUBLIC_BASE_URL, then PORTAL_BASE_URL, then APP_BASE_URL. Set one later when the public page and portal move to a second domain |

`AI_SERVICE_URL` and `PDF_SERVICE_URL` point to other Cloud Run services. Leave them alone.

## Google console whitelists (before the deploy)

1. **OAuth client for mail sending** (`MAIL_OAUTH_CLIENT_ID`, APIs & Services → Credentials):
   - Authorized redirect URI: `https://tabornik.online/api/mail-oauth/callback`
   - Authorized JavaScript origin: `https://tabornik.online`
   - Keep the run.app entries until CANONICAL_HOST is live.
2. **Firebase Auth** → Settings → Authorized domains: add `tabornik.online`.
3. **Firebase web OAuth client** (the "Web client (auto created by Google Service)"):
   - Add the redirect URI `https://tabornik.online/__/auth/handler`.
   - Add the JS origin `https://tabornik.online`.
   - Safari/iOS sign in through the same-origin helper (`src/lib/firebase.ts`), so they need this.

## Deploy order

1. **Domain live.** Load balancer, serverless NEG and certificate are set up. The DNS A record points to the LB IP. The certificate is ACTIVE, and `https://tabornik.online` serves the app (still running with the old APP_BASE_URL).
2. **Console whitelists.** Add everything from the section above.
3. **Deploy.** `gcloud builds submit` with `APP_BASE_URL=https://tabornik.online` (already in cloudbuild.yaml).
4. **Verify on https://tabornik.online:**
   - Google sign-in works, including on Safari/iOS.
   - Connecting a mail account works (the OAuth callback lands on tabornik.online).
   - A bill AI run finishes (Cloud Tasks POSTs to tabornik.online/api/tasks).
   - The public registration link and portal links in settings and e-mails show tabornik.online.
   - Cron jobs still succeed in Cloud Scheduler.
5. **Turn on the redirect.** Add `CANONICAL_HOST=tabornik.online` to `--update-env-vars` and deploy again. Check that a run.app page answers 308 to tabornik.online, and that `/api/cron` on run.app still answers without a redirect.

Rollback: remove CANONICAL_HOST. If that's not enough, set APP_BASE_URL back to the run.app URL and redeploy.
