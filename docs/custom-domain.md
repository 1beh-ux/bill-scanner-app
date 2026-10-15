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
| `CANONICAL_HOST` | `tabornik.online` | `src/proxy.ts`: 308 from `*.run.app` and `www.` + this host to this host for GET/HEAD, except `/api/tasks`, `/api/cron`, `/__/` |
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

## Google sign-in on our own host

`src/lib/firebase.ts` sets Firebase's `authDomain` to the current host for every browser, so Google's window says "continue to tabornik.online". `/__/auth/*` and `/__/firebase/*` are proxied to `<project>.firebaseapp.com` (`next.config.ts`; never to NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN).

Requirements:
- `https://tabornik.online/__/auth/handler` is listed in the Firebase web OAuth client.
- `tabornik.online` is listed among Firebase's authorized domains.

Dev hosts (localhost, Cloud Shell) keep firebaseapp.com outside Apple browsers.

## Embedding

The registration form (`/r/<slug>`) and the parent portal (`/p/<token>`) can sit inside the
organization's own website in an iframe (spec: docs/embed-design.md).

- **Who may frame what** (`src/proxy.ts` + `src/lib/host-rules.ts` `framingHeaders`):
  - admin hosts (tabornik.online, www, run.app): every page `Content-Security-Policy: frame-ancestors 'none'`
    + `X-Frame-Options: DENY`;
  - public hosts: `/r/*` and `/p/*` get `frame-ancestors 'self' <PublicHost.embedOrigins>` and no
    X-Frame-Options (empty list = `'none'` + DENY); the landing page only as `/?embed=1` (the portal
    snippet's fallback without a token); everything else `'none'` + DENY;
  - `/api/*`: only `X-Frame-Options: SAMEORIGIN` -- our own pages show bill / document files in an iframe;
    no CSP, because Next keeps the proxy's header over a route's own and the document downloads must keep
    their `Content-Security-Policy: sandbox`;
  - `/__/*` (Firebase's sign-in helper, framed by our own pages): untouched.
  The host's list comes from the 60 s per-instance cache in `src/lib/public-host.ts`.
- **Settings** (Aplikace → Veřejné adresy, super-admin; read-only in Organizace → Připojení):
  "Weby, které smějí stránku vložit" (`embedOrigins`, normalized `https://host[:port]`, http only for
  localhost) and, for portal hosts, "Stránka portálu na webu organizace" (`embedPageUrl`, its origin
  must be allowed). With `embedPageUrl` on the organization's default portal host every generated portal
  link is `<embedPageUrl>#t=<token>` (`portalLinkFor`) -- the token after `#` never reaches the website's
  server. Links already sent (`https://<portal host>/p/<token>`) keep working.
- **Embed mode** `?embed=1` (`src/components/embed/PublicFrame.tsx`): no theme toggle / footer,
  transparent background, compact margins, `?theme=light|dark` (else the system's), the height posted
  as `{ type: "tabornik:height", height }` and `{ type: "tabornik:scrollTop" }` after submit / errors /
  portal page changes; outside links open in a new tab, links within keep `embed=1`.
- **Portal gate in a frame**: third-party cookies are blocked, so the gate call also returns the signed
  value; embedded, the portal keeps it in sessionStorage (per token) and sends `x-portal-gate`
  (`portalScope` accepts cookie or header). Portal downloads are fetched with that header.
- **Snippets**: "Vložit na web" (event → Registrace a členství → public page) and "Vložit portál na web"
  (Připojení, portal host row) -- `src/components/embed/EmbedSnippetDialog.tsx`.
- **Checks**: `npx tsx scripts/check-proxy-hosts.ts` (rules), `bash scripts/embed-check.sh [none|zare]`
  (live headers + no Google Fonts), `scripts/set-zare-embed.ts` (one-off: Záře's websites; the portal
  page address only once that page exists).

## Appearance

Organizace → Vzhled veřejných stránek (`/appearance`, organization admin; `Organization.public*`):
body font, heading font, base size (14–18 px), heading size (menší / běžná / větší), line height. Null =
today's look. Applied to /r, /p and the landing (embedded or not) by `PublicFrame` through
`appearanceCss` (`src/lib/public-appearance.ts`); the admin app is unchanged. All fonts are self-hosted
by next/font at build time (`src/components/embed/public-fonts.ts`, preload off, so a browser downloads
only the font a page uses); the app's IBM Plex is self-hosted too -- no request to Google Fonts.
zare.cz (Drupal + Bootstrap 5): body = the system font stack ("Systémové písmo"), 16 px, line height
1.5; headings and menu "Trebuchet MS" (not a Google font) -> "Podobné jako na zare.cz (Trebuchet MS)" =
Trebuchet MS where installed, else Fira Sans; Bootstrap headings 40/32/28 px -> "Větší".
