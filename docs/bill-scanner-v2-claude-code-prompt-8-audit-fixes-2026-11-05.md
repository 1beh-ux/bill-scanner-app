# Claude Code prompt 8 – audit fixes (security, permissions, bank import, kitchen, UX, help)

Context: a full audit of tabornik.online was done on 2026-11-05 (code read of branch `audit-snapshot` @ 5a61a66 + live tests in the ZZ-TEST org / "ZZ-TEST Záře událost" as admin and non-admin). The owner (Pavel) approved ALL proposals. You are implementing them. Read `app/AGENTS.md` first (this is NOT the Next.js you know; read `node_modules/next/dist/docs/` for anything you touch in config, headers, images, proxy).

## Working rules
- Work in small phases, **one commit per phase**, message `audit: <phase> – <what>`. **Do not push** and do not open a PR; Pavel pushes.
- Before each phase: grep every caller of what you change (fix at the shared function, not at one call site).
- Never send mail, never call Fio/Gmail/Drive in tests; use mocks or `*.check.ts` style scripts already in the repo. Never touch production data. Off-limits events (never reference in seeds/tests): Tábor 2026*, Podzimní prázdniny 2026, Registrace 2027, Velikonoce 2027, KI Podzim 2026, Ples 2027.
- After each phase run `npx tsc --noEmit`, lint, and the repo's `*.check.ts` scripts; keep them green. For every non-trivial logic change add or extend ONE small check script in the existing style.
- Prisma migrations: additive only, named `2026110x_<name>`, no data loss.
- UI strings stay Czech (and English where the i18n system already has a key). Match existing tokens (Night/Ember/Paper/Pine); no new dependencies unless stated.
- If a decision below is marked **DEFAULT**, implement the default and list it in the final summary so Pavel can override.

## Phase 1 – Security hardening (quick wins)
1. **Upgrade Next.js** 16.3.0 → 16.4.5 (non-major) and fix other non-breaking `npm audit` findings (`npm audit fix`, no `--force`). Set `images.unoptimized: true` in `next.config` (the app has no need for the image optimizer, and `/_next/image` is reachable without login because `src/proxy.ts` matcher excludes it). Report remaining advisories and why they remain (transitive Google/Firebase).
2. `next.config`: `poweredByHeader: false`, and add headers for all routes: `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` — **except** pages that legitimately use camera (ticket scanning `/events/[id]/tickets/scan`: allow `camera=(self)`). Keep existing `X-Frame-Options`/`frame-ancestors 'none'` for the admin app, but **do not break the embed feature**: public hosts/embed pages (`/r/*`, portal embedded on zare.cz via "Vložené na web") must keep their per-host `frame-ancestors` logic – read how it is set today and preserve it.
3. **Portal pages** `/p/[token]`, `/u/[token]`, `/vstup/[token]`, `/vyuctovani/*`: send `Referrer-Policy: no-referrer` (tokens are in the URL) and `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.
4. **CSP**: add a real `Content-Security-Policy-Report-Only` first (script-src with nonce or 'self' + what Firebase auth needs, frame-ancestors unchanged). Do NOT enforce yet; add a short note in `docs/` on how to promote it to enforcing after a week of clean logs.
5. `hashedIp()` (portal-rate.ts / portal-gate.ts): stop using the FIRST `X-Forwarded-For` hop (caller-controlled). Use the platform-trusted client address (on Cloud Run behind the Google front end: the hop appended by Google = the LAST entry for a direct client, or the documented header; verify in Cloud Run docs and write the reasoning in a comment). Add a check script with spoofed headers proving two different spoofed first-hops from the same real IP share one bucket.
6. `POST /api/session`: wrap `verifyIdToken`/`createSessionCookie` in try/catch → 401 (not 500); add a simple per-IP throttle (reuse portal-rate infra); set cookie `sameSite: "lax"` explicitly (keep httpOnly, secure, 5 days).
7. Cron/tasks secret check (`/api/cron*`, `/api/tasks*`): compare with `crypto.timingSafeEqual` on equal-length buffers; remove logging of secret lengths.
8. `GET /api/config/drive-account`: require an org admin (`isOrgAdmin`) – today any logged-in user (even non-admin) gets the service-account e-mail. Check the UI callers still work for admins; non-admin UI must not call it.
9. Repo hygiene: `git rm` the committed 32 MB `cloud-sql-proxy` binary, add it to `.gitignore`, document how to download it in `docs/` (history is NOT rewritten – mention in summary that Pavel may want `git filter-repo` later).
10. `/api/events/[id]/mail` returns an HTML 404 page for API calls: make unknown API subpaths return JSON `{error:"not_found"}`.

## Phase 2 – Permissions: separate "works with receipts" from "administers the event" (finding P1)
Today `PATCH /api/events/[id]`, `close`, `reopen`, `drive-test`, `drive-export`, `drive-take-over`, `drive-identity` are gated only by `requireModuleAccess(user, id, "bills")`, so a helper with only the Účtenky grant can rename/re-date the event, close/reopen it and re-point Drive. Registration/bank fields and module toggles are already admin-only (keep).
**DEFAULT decision (no schema change):**
- Org-admin only: `close`, `reopen`, `drive-take-over`, `drive-identity` (change), and in `PATCH /api/events/[id]` the keys `name, startDate, endDate, kind, location`, all Drive folder-ID/export-folder keys, `portalOpen`, `peopleLinkMode`, `eligibility`, `priceRules`, `membershipYear*`.
- Still allowed for a bills holder: operational keys (`billsListColumns`, `billsListPills`, `qrSizeMm`, `mailQuestionnaireUrl` stays admin-only), `drive-test`, `drive-export` (accountants need export), plus the existing public-page keys for participants/tickets holders.
- Implement the key whitelist in ONE helper next to the PATCH handler (not scattered) and return `403 admin_only` for forbidden keys; write a check script that enumerates every key the handler destructures and asserts each is classified (so a new field can't silently become bills-writable).
- UI (`/events/[id]?tab=…` event settings): for non-admins hide or render read-only: "Uzavřít akci", Drive connection block ("Připojit můj Google účet", folder IDs, "Uložit složky"), name/date fields. Show a short note "Tohle upravuje správce organizace." Keep the Připojení tab visible read-only so helpers can see what is connected.
- Also grep for other routes gated only by `"bills"` that perform administrative changes (e.g. payers/settlement-settings/categories) and list them in the summary with your recommendation; do not change them without listing.
- Add a "who can do what" table to `content/help/pristup.md`.

## Phase 3 – Bank import window bug (finding B1)
`windowOf()` in `src/lib/bank/sync.ts` caps `to` at today for ALL sources, but the cap exists only because Fio refuses future dates. For paste/file/Sheet import into a future-dated event the window collapses to today..today and every row becomes "Mimo období".
- Split: `windowOf(link)` returns the real event window (link.dateFrom..dateTo); a separate `fioFetchWindow(link)` (or a `capToToday` param used only by the Fio sync/`bank-check` callers) applies the cap. Grep all callers (`api/events/[id]/bank/import/route.ts`, sync, cron, bank-check, `evaluate()` in `import.ts`) and make sure each uses the right one.
- Import preview must show the actual window ("Období akce 1. 8. – 10. 8. 2027") and, when ≥1 rows are "Mimo období", a one-line hint explaining why and how to widen the account link's dates.
- Check script: future-dated event + paste rows inside the event dates → status "new", rows outside → "outside"; Fio window still capped at today.
- Re-test mentally the six-row fake CSV from the audit (Billa ×2 same day, ATM, incoming 2 000 Kč VS 1001, fee): duplicates inside one paste must not be merged silently.

## Phase 4 – Kitchen diet safety (finding K-diet)
`POST /api/events/[id]/kitchen/diets` stores only ticked allergens/diets (+raw text + hash). Words that map to nothing (e.g. "anafylaxe") are never shown again after confirmation, so a cook sees "no allergens" for a child whose text said otherwise.
- On the Strava účastníků page and everywhere the confirmed diet is displayed (Kuchyně today, shopping, print): always show the **raw parent text** beside the confirmed chips, and a **warning chip "text obsahuje nepřiřazené výrazy"** when the proposal could not map every token (the proposal code already knows which tokens are unmapped – surface them).
- Confirming with unmapped tokens requires either a note or an explicit "Nepřiřazené výrazy jsem posoudil/a" checkbox; store which.
- Make the Kuchyně banner "N účastníků má neověřené alergie…" a link to Strava účastníků.
- Kuchyně price box "Vyberte kategorie potravin v nastavení" is already a link – keep, but make sure it deep-links to the right settings section.
- Investigate and report where the stray library meal "Česnečka (polévka · 1,3,7)" in the ZZ-TEST org came from (seed vs manual); if a seed creates it in new orgs, decide whether that is intended and tell Pavel.

## Phase 5 – Logic / duplication / naming
1. **One term:** menu and page say "Členové", help and several settings strings say "Lidé". Decide **DEFAULT: "Lidé"** for the menu/page title/URL label (it contains children, adults and adults outside the organisation – not all are "members") and keep `Členství` only for membership. Update every UI string, `content/help/*.md`, the favourites list in Osobní nastavení and i18n. Do not rename routes (`/children`) now.
2. **Bank accounts in two places** (Organizace → Připojení "Banka / + Připojit Fio účet" and Banka → Účty a import): keep ONE place of truth for the Fio token + account (Připojení), and in Banka → Účty a import show the account link per event with a "Spravovat účty a tokeny →" link. Add an explicit label/badge for account type if the data model has one (organisation vs personal); if not, add an optional `kind` text on `OrgBankAccount`-equivalent (additive migration) and warn when a personal account is linked to events.
3. **Připojení page** mixes public addresses and bank tokens under "Adresy, na kterých aplikace běží": split into two clearly titled sections with their own intro text, or two tabs.
4. **Test events:** add `isTest Boolean @default(false)` on Event (+ organization-level nothing). Test events: show a visible "TEST" badge, are excluded from Členové "Nepropojení účastníci", family suggestions, cross-event pickers/reports, the Využití totals and public host listings; participants of a test event are never auto-linked into org-wide people. Add a checkbox in Nastavení akce (admin only) and in event creation. Check script for the Členové query.
5. Ensure `/children` pages and `/api/children*` are org-admin only (the audit saw children's names/birth dates there); report the result.

## Phase 6 – UX fixes from the live test (U1–U9, PL1, SET1)
- **U1** readiness checklist "Akce je připravená N/5": unmet items must look unmet (empty circle + muted/plain label), met items ticked; label unmet ones as tasks ("Připojit schránku"), and make each row a link to the right tab.
- **U2** remove the dev note "napojení na Google Sheet přidáme později" from the Dotazník help text.
- **U3** show "Akce není připojená k registraci" only when the event actually has a registration-related feature on (public registration, portal, VS/payments); otherwise hide.
- **U4** module checkboxes in Nastavení akce: toggles must not be lost when clicked quickly. Serialize the PATCH calls (queue per event) or send the full set; show a brief "Uloženo" feedback; on failure revert and show an error. Add a check or component test simulating 6 rapid toggles.
- **U5** participant import auto-mapping: validate header "kind" – a header containing "e-mail" must never auto-map to a name field; "Jméno" + separate "Příjmení" must map to first name / last name, not to the combined field. Reuse the header-kind validation prompt 2 specified; check script with the audit headers (Jméno, Příjmení, Datum narození, E-mail zákonného zástupce, Telefon, Alergie).
- **U6** add an import target for **guardian e-mail** (and guardian name/phone if the model has them) so imported children get contacts; keep "Kontaktní e-mail (jen k párování)" as is.
- **U7** import result page: per-row table (created / replaced / skipped / error with reason) with a CSV download of errors.
- **U9** participants list default columns: trim to a sensible default (Jméno, Datum narození, Stav, Platba, Zákonný zástupce/e-mail, Dokumenty); the other columns stay selectable. Make the "Čeká — přijmout" status chip not look like a button (or make it one with a clear action).
- **PL1** Plánování empty state: short explanation ("Program skládáte po dnech z knihovny aktivit") with the **+ den** button inside it and a link to the help topic; add a touch/keyboard alternative hint for copy/parallel (Alt/Ctrl have no touch equivalent: add a "Kopírovat" and "Souběžně" action in the activity menu).
- **SET1** Osobní nastavení: group into sections with headings (Vzhled a jazyk · Menu · Google účet · E-maily), collapse the ~40-item favourites list into "Oblíbené v menu (N)" accordion, and add a link "Podpis a jméno odesílatele můžete změnit i v Poště".
- **Non-admin Účtenky page** shows "Nastavit v Připojení na Google" even to users who now (Phase 2) only see it read-only: for non-admins change to "Požádejte správce organizace o připojení Disku."

## Phase 7 – Help content (pack provided by Pavel's audit)
The audit produced a pack: `help-pack/content-help/*.md` (new: planovani, clenove, vzhled-verejnych-stranek, sablony, osobni-nastaveni) and `help-pack/images/*.jpg`. Pavel will attach the pack next to this prompt (the zip `help-pack.zip`).
1. Copy to `content/help/` and `public/napoveda/images/`. `clenove.md` must be renamed in line with the Phase 5 naming decision (title "Lidé", slug may stay `clenove`).
2. **Verify every claim** in these pages against the code and UI before keeping it (they were written from the UI text): Plánování "Tisk" and import wording, Šablony tab descriptions (Účtenky, Proměnné), Členové "Doplnit profily z poslední akce". Fix or delete anything unverified.
3. Add the images: `dospeli-1.jpg` into `dospeli.md`, `kuchyne-jidelnicek-1.jpg` into `kuchyne.md`.
4. Fix the stale wording: "Lidé → Přidat dospělého" paths, "Nastavení akce → Lidé" in `kuchyne.md` (check the real tab name), and add to `pristup.md` the who-can-do-what table (Phase 2).
5. Link topics to enabled modules: confirm `src/lib/help-content.ts` / the help sidebar only shows the topics for modules enabled for the current event/org (planning, kitchen, bank, health, mail, tickets); add `planovani` to that mapping.
6. Missing topics still to write after verifying behaviour in code: Sazby cestovních náhrad, Vozidla, Využití (usage and costs), Překlady, Kurzy, Veřejné adresy (admin). Short pages (what it is, who can use it, 3–5 steps); create them as stubs only if you can describe them accurately from the code.
7. Add one-line "?" hints (the existing in-app help pattern from prompt 3) to: Plánování, Dospělí na akci, Strava účastníků, Banka → Účty a import (import window), Připojení (two sections), Šablony.

## Phase 8 – Final verification
- `tsc`, lint, all `*.check.ts`, `next build`.
- Click-through checklist on a local/dev instance, admin and non-admin: event settings read-only for non-admin; close/reopen blocked via API (`403 admin_only`); drive-account blocked for non-admin; headers present on `/login` (`curl -I`); portal page has `no-referrer`; embed pages still embeddable on the allowed origins; ticket scanner still gets the camera; bank paste-import on a future-dated event shows "Nové", not "Mimo období"; kitchen diet with an unmapped word shows the warning; Členové excludes a test event.
- Write `docs/audit-2026-11-05-fixes.md`: what changed per phase, DEFAULT decisions taken, anything skipped and why, and the follow-ups: promote CSP report-only → enforcing, `git filter-repo` for the binary, deploy order (migration before app for Phase 5.4 and 5.2).
- Final answer to Pavel: per-phase commit list, DEFAULT decisions to confirm, risks for deployment. Remember: do not push.

## Out of scope (separate, later)
Full code/safety audit pass 2 (mail send paths, Fio sync, Drive export, travel-order PDF, ticket scanning, portal flows with real tokens, XSS/CSRF fuzzing, load/brute-force). Do not start it here.
