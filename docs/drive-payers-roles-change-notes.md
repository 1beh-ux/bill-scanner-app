# Roles / payers / per-user Google account / bills UX — change notes

Source: `claude-code-prompt-drive-payers-roles.md` (product owner decisions are final).
Rule: no push, no deploy. Every step ends with tsc + eslint + commit. Migrations additive only.

## Decisions (short)
1. `admin` = everything + global pages. `accountant` = ordinary user (label only, enum stays). `user` = small admin of granted events.
2. Event context identical for admin and user. Only the global menu section is admin-only.
3. "Autoři/Zaplatil" -> "Plátci/Payers" in UI text + translation values. DB model names (`Author`) unchanged.
4. One global `Author` per person; `AuthorEventAccess` links to events.
5. Event users: list/add/edit bank details/remove-from-event (delete `AuthorEventAccess` only). Bills keep their payer.
6. Global payers list/edit/merge/deactivate: admin only.
7. Payments page: only the selected event's data (admin too).
8. Bank-detail audit (`AuthorBankAudit`), 30-day "changed" hint, admin full history.
9. Google account per user; event remembers `driveConfiguredByUserId`; fallback = service account + warning.
10. Precise Drive error codes (Part 4 table).
Parts 7-15: bills UX (blank-page split, ConfirmDialog, FX preview, budget at 0, bills columns, switcher persistence,
translations audit, manifest category pairs, hidden controls). Check first whether already fixed.

## Map (Part 0)
### Drive layer — everything routes through `src/lib/drive.ts`
`getDriveClient/getSheetsClient/getDocsClient` (module-level `getAuth()`; 60 s global cache `cachedOAuth`; latest `DriveAccount`
wins, else Impersonated service account). Exported helpers and their callers (all have an event in scope):
- `uploadFileToFolder`: `drive-export.ts`, `parent-summary-pdf.ts`, `mail-drive-sync.ts`
- `getOrCreateSubfolder`: `mail-drive-sync.ts`, `participant-bulk-email.ts`, `api/participants/[id]/drive-folder`
- `findFileInFolder`: `drive-export.ts`, `document-merge.ts`; `updateFileContent`: `mail-drive-sync.ts`
- `createManifestSheet/writeManifestValues`: `drive-export.ts`, `mail-sheets-sync.ts`
- `listAuthorSubfolders/listFilesInSubfolder/downloadFileBuffer`: `drive-import.ts`
- `readSheetValues`: `api/events/[id]/health/participants/sheets-preview`
- `getDriveClient` direct: `document-merge.ts`, `api/events/[id]/drive-test`; `getDocsClient`: `document-merge.ts`, `template-check.ts`
- `usingConnectedDriveAccount`: `document-merge.ts` (scratch copy goes to `root` of the connected account)
- `getDriveServiceAccountEmail`: `api/config/drive-account`, sheets-preview
- OAuth: `api/mail-oauth/authorize|callback` (`purpose=drive`, stores `DriveAccount`); UI `events/[id]/page.tsx` Drive tab.
- Background/cron: `api/cron/mail-drive-sync`, `mail-sheets-sync` (event-scoped), scripts `list-export-folder`, `inspect-file`,
  `cleanup-manifest-duplicates` (use `getDriveClient` directly).

### Roles
- `module-access.ts`: `hasModuleAccess` (admin -> true; accountant+bills -> true = the shortcut), `allowedParticipantFieldKeys` (admin branch).
- `events/[id]/page.tsx` ~L1016 access grid renders accountant "implicit" bills; `users/page.tsx` role select (3 roles).
- Admin-only API guards already exist for: users, translations, list/participant-field/email templates, event create/delete/reopen,
  modules, module-access. `GET /api/events` returns ALL events to every user (no access filter).
- Global nav: `nav-sections.tsx` (`adminOnly` flags: events, templates, users, translations) + `AppSidebar`.

### Payers
- `api/authors` (GET/POST), `[id]` (GET/PATCH/DELETE), `[id]/merge`, `[id]/events`: only `getCurrentUser()` — any user can list
  every payer with bank accounts, edit, merge, delete.
- Consumers: `authors/page.tsx` (global list, event matrix, merge), `events/[id]/payments/page.tsx` (PATCH bank details),
  `events/[id]/import/page.tsx` and `bills/[billId]/page.tsx` (`GET /api/authors` for dropdowns).
- `unpaid-summary` API is already per event; scope `all` still filters `paidToAuthor:false` (cause of the empty "Všechny" tab).
- `drive-import.ts` and `bill-move.ts` grant `AuthorEventAccess`.

## Findings that contradict / extend the brief
- Part 1: `reopen` was admin-only while `close` needs only bills access -> a user could close but never reopen. Reopen now uses the
  same bills-access guard (decision 1: user = small admin of the event).
- Part 1: `GET /api/events` returned every event to every user. Now non-admins get only events they hold a module grant on
  (needed for the switcher/pickers; the brief implies it in Parts 12/2 but does not say it explicitly).
- Part 1: the Přístup / Moduly tabs (event settings) stay admin-only: the underlying APIs are admin-only and Pavel asked for it
  earlier; they are grant management, not page content. No other admin-only control exists on event pages.
- Part 1: `/authors` and `/exchange-rates` (+ their APIs) are now admin-only; sidebar "bills" section hides them for non-admins.
- Deploy order note: run `scripts/grant-accountants-bills-access.ts` (dry run, then `--apply`) BEFORE the new code is live.

- Part 3: the "Všechny" payments tab now lists paid AND unpaid bills of any status (approved tab unchanged: unpaid+approved).
  Payments rows are built from the event's bills, so a payer removed from the event's list is STILL shown while owed money
  (flag `attached:false`, no bank-edit button) -- hiding owed money would be worse than the brief's "only payers attached".
- Payers rename: 19 existing translation rows updated by `scripts/update-translations-payers.ts` (dry run by default, `--apply`);
  `prisma/seed.ts` source values updated too. `scripts/seed-camp-helper-i18n.ts` did not contain these keys.

- Part 4 design: `DriveAccount.connectedByUserId` is now UNIQUE (1 connection per user; reconnect replaces own row); `email` stays
  unique, so a Google account already held by another user is refused (`driveConnect=in_use`) instead of being taken over.
  Added `tokenInvalidAt` (set at runtime when Google answers invalid_grant, cleared on reconnect) and `Event.driveConfiguredByUserId`.
  `getDriveIdentity(eventId)` = configured user's account, else the service account with a warning (no_connection / token_invalid /
  user_inactive). Every drive.ts helper now takes `eventId`; the global 60 s "latest connection" cache is gone (per-account OAuth
  clients, 20 s identity cache invalidated on connect/take-over/folder save).
- Part 4: `withRetry` used to retry EVERY error 3x (also 404/403). Now only 429/5xx/network/timeouts are retried.
- Part 4: `drive-test` existed but the button was never rendered; the tab is now `components/events/DriveSettingsTab.tsx` (identity block,
  three folders, URL->id, save -> auto test, per-folder test, export with `manifest_missing` -> "recreate" confirm).
- Part 4: a remembered manifest that vanished used to be silently recreated (duplicates risk); now `manifest_missing` + explicit confirm.
- Part 4: `mergeAndExportDocument` and `template-check` also resolve the identity through the event (document merge runs as the
  event's configured user).
- Deploy order (Parts 1-4): 1) `prisma migrate deploy`; 2) `scripts/grant-accountants-bills-access.ts` dry run then `--apply` (BEFORE the new
  code serves traffic); 3) `scripts/backfill-drive-configured-by.ts` dry run then `--apply`; 4) `scripts/update-translations-payers.ts --apply`;
  5) `scripts/seed-missing-translations.ts`. Users must re-connect nothing: the existing app-wide connection stays valid and is
  assigned to the events by step 3.

- Part 5: import page now keeps ONE result per run (`ImportRunResult`): per-file rows (imported/duplicate/skipped/failed + reason, Drive
  failures via mapped codes) and the payers matched/created from subfolders; the accumulated counters and the stale info line are gone.
  Errors show next to the buttons that caused them (import buttons, merge button, bills bulk toolbar) and clear on the next action.
  `drive-import` now also returns `skippedAlreadyImportedFiles`, `identityEmail`, `serviceAccountEmail`.

## Part status (7-15)
- Part 15 (hidden controls): changed. Findings vs the brief: the app has NO Tailwind hover-hiding (`group-hover`/`opacity-0`/`invisible` grep = empty).
  "Doplnit zbytek" was a bare "=" button whose only label was a hover `title` -> now a visible labelled button under each split row together
  with "Zbývá rozdělit: X" (shown only while something is left to assign). Other icon-only controls got `aria-label`s (remove split, previous/next
  bill). Escape on the bill page used to `router.push` back to the list -> now it only closes the image editor (dialogs handle their own Escape) and
  never navigates. Unsaved changes: back link, previous/next and arrow keys ask with the styled dialog; reload/close gets the browser's own prompt
  (a native one is the only option there). Nothing else in `src` is hover-only (checked `onMouseEnter`/`title=` usages; the import-page file preview
  is an optional extra on hover, the file link itself stays visible).
- Part 14 (manifest): changed. `src/lib/manifest.ts`; header = Datum, Obchod, Částka, Měna, Částka Kč, Plátce, Proplaceno, Soubor, Odkaz + `Kategorie n` /
  `Částka kat. n (Kč)` pairs (max categories per bill, min 1; categories sorted by name; single category = bill total). "Proplaceno" = Ano / Ne /
  "Akce hradí přímo"; the payer column says "Akce (bez proplacení)" for event-paid bills. `writeManifestValues` clear range is A1:ZZ10000 (was
  A1:Z10000), so extra columns never leave stale cells. Nothing else reads manifest columns by position (`cleanup-manifest-duplicates.ts` only
  deletes by title). The "+n" file-name suffix (`name.pdf`, `name_2.pdf`, ... for equal display names) is unchanged: it is not a bug, it makes
  export names unique. Existing manifests get the new layout on the next export (the sheet is rewritten each run).
- Part 7 (blank pages): changed. `src/lib/pdf-blank.ts` (pdfjs-dist, already a dependency; no new one): blank = no text AND no vector drawing AND
  (no image OR every image flat). Flat = pixels pooled to ~150 px wide by their WORST pixel, 2 % border ignored, >= 99.9 % background blocks
  (deliberately stricter than the brief's 99.5 %: pooled blocks make a single line of text count; recorded here as a deviation).
  Blank pages are skipped and reported (`blankPagesSkipped`, shown on the upload and Drive results); all-blank file keeps page 1; any analysis
  error keeps every page. Page numbering keeps the ORIGINAL numbers. Failed-bill notes: raw English AI text is logged, the note is a fixed
  Czech message (`ai-failure-note.ts`); `scripts/fix-failed-bill-notes.ts` (dry run/--apply) fixes old rows.
  Found on the way: the standalone build did not ship `pdf.worker.mjs` (detection would silently do nothing) -> `outputFileTracingIncludes`
  in next.config.ts; verified by running pdfjs from `.next/standalone`. Test: `scripts/test-blank-pages.ts` (16 checks with generated fixtures:
  text page, scan without text layer, blank page, flat noisy scan, faint-border scan, vector-only page, small-text scan).
- Part 8 (ConfirmDialog): changed. `src/components/ConfirmDialog.tsx` (`ConfirmProvider`, `useConfirm`, `useAlert`), mounted in
  `providers.tsx`. All 28 native pop-ups (`window.confirm`/`alert`) replaced; `grep` for `window.(confirm|alert|prompt)` is empty.
  New confirms: bulk approve (count + "lze vrátit Znovu otevřít"), bulk mark paid/unpaid, bill-detail paid toggle.
  Not browser-tested (no browser in this environment): focus trap / Esc / Enter behavior is by construction (safe button focused first).
  Translation keys go into `scripts/seed-missing-translations.ts` (single idempotent script, extended per part).
