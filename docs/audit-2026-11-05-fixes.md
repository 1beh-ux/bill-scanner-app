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

# Round 2 (prompt 9, 2026-11-05)

| Commit | Phase |
|---|---|
| `24ddd0b` | F – found in the simulation |
| `6b46895` | A – kitchen safety round 2 |
| `38445df` | B – travel orders, receipt import, defaults |
| `8f6a8af` | D – access, public pages, tickets |
| `6719d9c` | E – bank import, budget, phones |

**F.** SEC-SIM1: `portalUrl()` builds links only from configuration (the org's portal host, else `PORTAL_BASE_URL` / `PUBLIC_BASE_URL` / `APP_BASE_URL`); it no longer takes the request, and with nothing configured no link is mailed (`scripts/check-no-header-links.ts` + isolation test). Only `host-rules.ts` (routing, DB-checked) reads the Host headers. HY1: `i18n.tsx` first render is identical on server and client; cached values applied in `useLayoutEffect` (verified in headless Chromium: no React #418 after reloads with cached lang / role / texts). DEP1: `npm run bootstrap` (`scripts/bootstrap.sh`) – migrations, base seed, every translation seed in the order added to git, app templates; `create-app-templates.ts` no longer fails on an empty DB; tested twice on an empty database. TK2: an empty `{event_place}` drops its ", " / " · " in every template (in `substituteVariables`, so the organizations' stored copies are covered). R5-1: recovery counts only sent mails per e-mail; a full quota answers the usual "ok". Tap targets: one rule in `globals.css` (≥ 36 px below md, checkboxes 20 px); measured at 375 px on /login: none under 36 px.

**A.** K5: confirming a diet with fewer allergens / diets than the parents' text needs a typed reason or "Potvrzuji, že dítě nemá tyto alergie" (server-enforced, stored as `dropped` / `dropped_reason`). K3: saving a meal reloads the page's ingredient list before the editor redraws. K4: allergens everywhere as "1 – lepek" (one renderer), unconfirmed people named. K6: Czech plurals via the existing `src/lib/plural.ts`. D1: the Zdraví card shows the kitchen's diet state with a link to Strava účastníků. KL: no seed creates "Česnečka"; it was not touched.

**B.** T1: empty drafts (no worker, vehicle or route) are deleted after a day when the list loads; Odeslat lists every missing item (one shared rule in `src/lib/travel-orders.ts`, the server returns them all) and each item scrolls to its field. R1: the import shows "Nahráno k potvrzení" until Potvrdit. P2: membership shows "Ano" / "Ne" only when known, else "—" (`memberLabel`); prices / VS unchanged.

**D.** N1: non-admins get bank accounts reduced to label, bank code, last 4 digits and "token set", and only the mailboxes they connected themselves. N2/N3: one denial page (`src/components/NoAccess.tsx`) and a server layout guard on every module folder (also for direct URLs, e.g. /mail); create / duplicate / delete event and Šablony hidden for non-admins. N5: Dospělí na akci open to Účastníci, Kuchyně or Účtenky (Kuchyně routes still need Kuchyně). R4-10: paid ticket orders are refused without a payment account and a connected sender; the confirmation mentions the e-mail only when it went out; "Platební údaje vám pošle pořadatel" instead of "Číslo účtu —"; settings warn. R4-9: "+" capped by what's left in total; plural hint. R4-7: ticket events don't show the parents' deadline / Dotazník block or that checklist item; own wording and appearance sample. R4-2: confirmation summary + reference `R-XXXXXXXX` (searchable in Účastníci); no e-mail promise without a sender. R4-3 guardian name required; R4-5 no super-admin strip on public pages; R4-6 `/events/new` → `/events`; R4-12 help intro; R4-13 "neověřeno" badge on rate sets marked "(ověřit)". R5: recovery answers take ≥ 2.5 s either way; a new link's mail says the old one stopped working.

**E.** Import keeps its period line after confirming; Fio accounts say "Fio se ptáme jen do dneška" when the period ends later. Budget: unsorted bank incomes as "Neroztříděno". Planning toolbar wraps on phones (other pages already scroll tables / stack columns).

## Round 2 DEFAULT decisions

1. T1: kept "draft on click" (the form autosaves into it) + clean-up after a day, instead of a client-only form.
2. T1: worker address and phone now block Odeslat (they were warnings).
3. N1: non-admins see only their own connected mailboxes.
4. N5: Dospělí na akci = Účastníci, Kuchyně or Účtenky.
5. K5: the general note doesn't count as the reason for dropped items; a separate reason or the explicit tick is needed.
6. R4-2: the reference is the first 8 characters of the registration id (searchable), since the participant number only exists after acceptance.
7. R5: equal response time instead of "send after responding" (request-based CPU would throttle the send).
8. BK1: a row dated after today but inside the event period stays **Nové** (prompt 8 requires this for future events); only the Fio request is capped at today, and that is now said on screen.
9. BK6: kept the native select (type-ahead) – it already lists only active events you have Účtenky for and asks for confirmation naming the target.

## Round 2 skipped

- R4-1 typo "mimo oddíly)": not in the code – it is in a price label saved in an event's data; fix it in that event's price settings.
- MB1 Playwright screenshots of logged-in pages: no way to sign in headlessly (Google login); checked the markup instead and fixed the planning toolbar.
- sim-kit checks: no `sim-kit/` in the repository.
