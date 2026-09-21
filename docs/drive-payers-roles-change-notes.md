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

## Part status (7-15)
(Filled in as parts are done: already fixed / changed / skipped.)
