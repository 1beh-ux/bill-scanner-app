# Audit 2026-11-05 – what was fixed

Prompt: `docs/bill-scanner-v2-claude-code-prompt-8-audit-fixes-2026-11-05.md`. One commit per phase, nothing pushed.

## Commits

| Commit | Phase |
|---|---|
| `2df8313` | 1 – security hardening |
| `13af16d` | 2 – permissions (receipts vs administering the event) |
| `4f1f1b2` | 3 – bank import window |
| `032aa4b` | 4 – kitchen diet safety |
| `9ff44f3` | 5 – naming, bank accounts in one place, test events |
| `9c503b2`, `920dd94` | 6 – UX fixes (U1–U9, PL1, SET1) |
| `2fd2e60` | 7 – help content |
| this commit | 8 – verification, this document, deploy seed |

## What changed per phase

**1 Security.** Next 16.4.5. Headers on every response (HSTS, nosniff, Referrer-Policy, Permissions-Policy with the camera only on the two scanner pages) in `next.config.ts`; framing stays in `src/proxy.ts`. Token pages (`/p`, `/u`, `/vstup`, `/vyuctovani`, `/api/portal`, `/api/public`): no-referrer, noindex, no-store. CSP in **report-only** mode, violations logged by `/api/csp-report` (`docs/csp-report-only.md`). Rate limits use the real client IP (`src/lib/request-security.ts clientIp`). `/api/session`: bad token = 401 (was 500), 30 attempts / 15 min per IP, `sameSite: lax`. Cron and task secrets compared in constant time. `/api/config/drive-account` admin-only. `cloud-sql-proxy` binary removed from the repo (`docs/cloud-sql-proxy.md`). Unknown `/api/*` paths answer JSON 404.

**2 Permissions.** `src/lib/event-patch-access.ts`: one table of who may write each key of `PATCH /api/events/[id]`; `scripts/check-event-patch-access.ts` fails when the handler reads an unclassified key. Name, dates, kind, place, Drive folders, registration, portal, prices, payments, VS, `isTest` = admins; bills-list settings = Účtenky; public page = Účastníci / Vstupenky. Close, reopen, Drive take-over: admins. UI: non-admins see "Tohle upravuje správce organizace." and a read-only Drive block. Who-can-do-what table in `content/help/pristup.md`.

**3 Bank window.** `windowOf` is the event's real period; only the Fio API request is capped at today (`fioFetchWindow`). Paste / file / Sheet into a future event: rows are Nové, not Mimo období. Preview says "Období akce …" and explains Mimo období rows.

**4 Kitchen.** The parent's own allergy text and an "unmatched words" chip wherever diets show (plan, Dnes, conflicts, print) plus a red warning box. Confirming a diet with unmatched words needs a note or the "posoudil/a" tick (server enforces; stored as `participant_diets.unmapped` / `unmapped_reviewed`). Price box links to the food-category setting.

**5 Logic / naming.** One term **Lidé** (was also "Členové"). Fio accounts and tokens only in Organizace → Připojení (the old event-level token endpoint answers 409); accounts have a type (organizace / osobní) with a warning when a personal account is linked to events. Připojení in two sections. **Test events** (`events.is_test`): TEST badge, participants never linked into Lidé, left out of Lidé's unlinked list, profile fill, pickers, portal and Využití organization totals (`scripts/check-test-events.ts` + isolation test). `/children*` confirmed admin-only.

**6 UX.** U1 checklist as tasks (○ / ✓, each row opens its tab). U2 dev note removed. U3 "not connected" only with registration features on. U4 module toggles: optimistic, sent one at a time in click order, a failed one flips back (`src/lib/serial-queue.ts`, `scripts/check-serial-queue.ts`). U5 import headers: an e-mail header never maps to a name; "Jméno" + "Příjmení" = first / last name (`scripts/check-participant-import-headers.ts`). U6 guardian e-mail target labelled as such. U7 per-row import result + CSV of problem rows. U9 participants list: no optional columns by default; "Čeká" + a real **Přijmout** button. PL1 empty state with **+ den** and help; touch hint. SET1 sections + favourites accordion. Non-admin Drive message: "Požádejte správce organizace o připojení Disku."

**7 Help.** Pack copied in; every claim checked against code (corrections below). Images added to `dospeli.md` and `kuchyne.md`. Six new topics: sazby, vozidla, využití, překlady, kurzy, veřejné adresy. Sidebar "?" now also for Plánování, Kuchyně, Banka; "?" on Plánování, Dospělí na akci, Strava účastníků, Šablony, both Připojení sections (Banka pages had one). `scripts/check-help-links.ts`.

## DEFAULT decisions

Confirmed by Pavel on 2026-11-05: 1–4 and 7 accepted; 5 stays as it is. Still open: 6, 8, 9.

1. Migrations dated `20261118…`, after the latest applied one, so they sort in order.
2. Client IP: custom domains take the 2nd-to-last `X-Forwarded-For` entry (load balancer), `*.run.app` the last one. Based on `docs/custom-domain.md`; Google's docs were not fetchable in-session.
3. CSP report-only allows `'unsafe-inline'` scripts (Next without nonces).
4. Banka users no longer set Fio tokens and can't create a Fio account from Banka (only Sheet / file sources); admins do it in Připojení.
5. Stay open to anyone with the Účtenky module (Pavel's decision): payer bank details, the event's receiving account, category budgets, Drive cleanup. Finer access levels may come later.
6. U6: the column-mapping dropdown calls the field "E-mail zákonného zástupce" (it writes the guardian row); the match-by list keeps "Kontaktní e-mail (jen k párování)".
7. U9: no optional columns by default, which also applies to existing events that never saved a column choice.
8. PL1: copy / parallel on touch use the existing block dialog ("Přesunout nebo kopírovat", targets include "souběžně s …"); no second mechanism, only the hint.
9. Help: `clenove.md` keeps its slug, title "Lidé".

## Skipped, and why

- **SET1 link "Podpis a jméno odesílatele můžete změnit i v Poště"**: not true. The signature is only editable in Osobní nastavení; the event's Připojení tab only shows it and links to Osobní nastavení.
- **Help topics filtered by enabled module** (Phase 7.5): `/napoveda` is one page prerendered at build, with no event context; there is no per-module topic filter. The module → topic mapping that does exist is the sidebar's "?" per section (sections show only for enabled modules), and `planovani` / `kuchyne` / `banka` were added there.
- **npm audit**: 19 advisories left (4 high, 15 moderate), all need major upgrades (firebase, firebase-admin, @google-cloud/storage, eslint-config-next).
- **Browser click-through as admin / non-admin**: needs real Google sign-ins. Covered instead by the API tests in `scripts/test-org-isolation.ts` (non-admin: rename / Drive folder / close / reopen / take-over / drive-account → 403, event unchanged) and the HTTP checks below.
- **"Česnečka" in Kuchyně**: no seed creates meals, so it was added by hand or by an import; its row couldn't be read (gcloud logged out).

## Verification (2026-11-05)

- `tsc` (0 errors), every `scripts/check-*.ts` and `src/lib/*.check.ts` passes, `next build` passes. ESLint: no new errors in changed files (the remaining ones were there before).
- DB tests on a throwaway local Postgres: `test-org-isolation` 97/97, `test-travel-orders` 41/41.
- Built app (`next start`), `curl`: `/login` has HSTS, nosniff, Referrer-Policy, Permissions-Policy, CSP-Report-Only, `frame-ancestors 'none'`, no `X-Powered-By`. `/p/…` has `no-referrer`, noindex, no-store. `/vstup/…` and `/events/…/tickets/scan` have `camera=(self)`. On a public host with an allowed origin, `/r/…` and `/p/…` send `frame-ancestors 'self' https://www.zare.cz` (still embeddable). `/api/session` with a bad token = 401. `/api/config/drive-account` without a session = 401. Cron without a secret = 401. `/api/csp-report` = 204 and logs the path without the query.
- Future-event paste = Nové: `scripts/check-bank-window.ts`. Unmatched diet word: `scripts/check-kitchen-allergens.ts`. Test event out of Lidé: isolation test.

## Follow-ups

1. **Deploy order**: `deploy.sh` runs `prisma migrate deploy` before the build, so the three additive migrations (`diet_unmapped`, `bank_account_kind`, `event_is_test`) land before the new code. `seed-audit-2026-11-i18n` was added to `deploy.sh`'s seed list. Without it the new texts show as keys.
2. **CSP**: watch `[csp-report]` logs for a week, then promote to enforcing (`docs/csp-report-only.md`).
3. **Binary in history**: `git filter-repo --path cloud-sql-proxy --invert-paths` (rewrites history; coordinate before pushing).
4. Out of scope, still to do: audit pass 2 (mail send paths, Fio sync, Drive export, travel-order PDF, ticket scanning, real-token portal flows, XSS / CSRF, brute force).
