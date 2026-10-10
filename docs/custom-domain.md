# Custom domain: tabornik.online + public hosts

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
| `CANONICAL_HOST` | `tabornik.online` | `src/proxy.ts`: 308 from `*.run.app` to this host for GET/HEAD, except `/api/tasks`, `/api/cron`, `/__/` |
| `ADMIN_HOSTS` | unset = `tabornik.online,www.tabornik.online` | `src/lib/host-rules.ts`: admin hosts, plus `*.run.app`, localhost, `*.cloudshell.dev` |
| `LB_IP` | `34.144.251.105` | "Ověřit" in Veřejné adresy: the hostname must resolve to it |
| `PORTAL_BASE_URL` / `PUBLIC_BASE_URL` | unset | fallbacks in `publicUrl()` (`src/lib/public-host.ts`) when no public host row applies |

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

## Host types (`src/proxy.ts`, `src/lib/host-rules.ts`)

- **Admin host**: ADMIN_HOSTS, `*.run.app` (308 to CANONICAL_HOST), localhost, Cloud Shell. Behaves as it always has.
- **Public host**: any other hostname. It serves only `/r/`, `/p/`, `/api/public/`, `/api/portal/`, `/_next/` and `/favicon.ico`. `/` shows a neutral landing page (`/public-landing`). Every other path returns a plain 404, and a public host never redirects to `/login`. The proxy checks only the host and path, without touching the DB.
- The `session` cookie has no Domain attribute, so it never reaches a public host.

## PublicHost table (`public_hosts`)

Organizace → Připojení → Veřejné adresy. Columns:
- `hostname`: lowercase, no port.
- `purpose`: `registration` | `portal` | `both`.
- `eventId`: registration hosts only (enforced by a DB check). Empty means every event.
- `isDefault`: at most one active default per purpose, where `both` counts for both. The API enforces this.
- `active`.

There is no organization column yet; `organizationId` can be added later.

- **Scope** (`resolvePublicHost`, 60 s per-instance cache):
  - `/r/<slug>` and `/api/public/r/*` are served only by a host whose purpose allows registration and whose event is empty or matches.
  - `/p/*` and `/api/portal/*` are served only by a portal or both host.
  - An unknown host gets 404.
- **Admin host**: GET `/r/<slug>` and `/p/<token>` are 308-redirected to the public host: first the event's own registration host, then the default. Old e-mail links keep working this way.
- **Links** (`publicUrl(purpose, eventId, path)`): event host → default host → PORTAL_BASE_URL (portal only) → PUBLIC_BASE_URL → APP_BASE_URL.

**Why portal hosts are global only:** one portal link is a family's link across all their events. Tying it to one event would split a family across domains, and a parent would have to enter the birth date again on each one, because the gate cookie belongs to a single host.

**Note:** the gate cookie is per host. A parent moved from tabornik.online to the portal host enters the birth date once more.

## Onboarding a new public domain

1. **Certificate** (Organizace → Připojení → "Příkazy" on the row gives the exact commands with the hostname filled in):
   - `gcloud certificate-manager dns-authorizations create <n>-auth --domain=<host>`
   - `... dns-authorizations describe <n>-auth`, then add the `_acme-challenge` CNAME it prints at the domain's DNS
   - `gcloud certificate-manager certificates create <n>-cert --domains=<host> --dns-authorizations=<n>-auth`
   - `gcloud certificate-manager maps entries create <n>-entry --map=tabornik-map --certificates=<n>-cert --hostname=<host>`
2. Add the row in **Veřejné adresy** (purpose, event, default).
3. At the domain's DNS: `CNAME <host> -> public.tabornik.online`. The `*.tabornik.online` record points to the load balancer.
4. Press **Ověřit**. It checks that DNS points to LB_IP, then that the TLS certificate works, then that the landing page loads. Each step has its own error message.

**Order matters:** a default host is used in links and the admin host redirects to it from the moment its row is active. Before the DNS points to it and the certificate works, keep the row inactive, or don't mark it default.
