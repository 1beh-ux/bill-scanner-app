# Registration & membership — slice 7 (bulk import of permanent documents from Drive): build summary, 2026-10-06

Spec: `docs/registration-slice7-spec.md`. Earlier: `docs/registration-slice6-spec.md`,
`docs/registration-slice6-build-summary.md`. Branch `registration-slice7`. Not merged, not deployed.

## Opt-in guarantee (still holds)

Nothing changes until an admin opens "Importovat z Drive" and confirms an import:

- The button only shows on an event document type whose template is "platí trvale",
  and only for admins. No permanent template → no button.
- The preview reads Drive only; it writes nothing.
- The only change to shared code is the Drive listing asking for three more fields
  (`webViewLink, size, sha256Checksum`) — the bills import ignores them.
- No e-mail is sent. No migration.

## What was built

| Spec | Where |
|---|---|
| Where | Event → Dokumenty → a "platí trvale" type → "Importovat z Drive" (`ListTemplateAdmin.tsx` → `DriveDocImport.tsx`). Uses the event's Drive identity (`listFilesInSubfolder`, `getDriveFileMeta`, `downloadFileBuffer` + the new `exportFileAsPdf` in `src/lib/drive.ts`, errors via `DriveError` / `driveErrorText`). |
| 1. folder | Link or id via the existing `parseFolderId` (`drive-errors.ts`). Files directly in the folder. Native Google Docs / Sheets / Slides / Drawings are exported as PDF (`drive.files.export`); other native files (Forms, shortcuts…) are "přeskočeno" with a reason; so are non-PDF/JPG/PNG files and files over 15 MB (the admin-upload limits). |
| 2. matching | `src/lib/doc-import-match.ts` (pure): `fileNameTokens` (no extension, lower-case, no diacritics, split on non-letters so digits go, noise words dropped) and `matchPeople` (every first-name and last-name word present, any order; event participants first, nobody hidden). Run against all people in Lidé. |
| 3. preview | One row per file: name + "otevřít" (`webViewLink`), status ✓ / více možností / nespárováno / už importováno / přeskočeno, a searchable person picker (`<datalist>` over Lidé, participants first, same label as the add-participant picker; "více možností" also lists the candidates as one-click choices), and "Přeskočit". "Už importováno" = Drive's `sha256Checksum` (first 16 hex = our `contentHash`) already on a person document of that key for anyone; skipped by default. |
| 4. confirm | Client sends batches of 10 (`POST /api/events/<id>/list-items/<itemId>/drive-import`), progress "Importováno x z y". Per file: download/export → `readUploadedFile` (same checks as the person-page upload) → `savePersonDocument` (same as `POST /api/children/<id>/documents`: GCS `people/<childId>/documents/…`, becomes current, history kept). A failing file gets its error in its row; the rest continue. |
| 5. re-run | Preview marks known hashes "už importováno"; the import also re-checks the hash after download and refuses a duplicate unless the admin un-ticked "Přeskočit" on an "už importováno" row. Rows already imported in the open dialog are not sent again. |

## Assumptions (spec silent → simplest option)

1. **Admin only** (preview and import), like the person store routes.
2. **Source = admin import** is stored like the person-page upload (no source event,
   no source participant document) — the person page shows "nahráno zde". The event
   is not recorded as the source (it's only the Drive context; recording it would
   show "z profilu (<akce>)" wrongly). Telling import from upload apart would need a
   new column; not added.
3. **Name words**: `firstName` + `lastName` when both are set, else the words of `name`;
   a person with a single name word never matches. Multi-word names need every word.
   Noise words: přihláška/oddíl variants, scan/sken/img/foto/dokument, pdf/jpg/png,
   kopie/copy, podepsaná/podpis/signed/final, do/na/a.
4. **Natives exported to PDF are not recognised as "už importováno" in the preview**
   (Drive keeps no hash for them); the import's own hash check catches them only if
   Drive's export is byte-identical, which isn't guaranteed. Re-running may re-import
   a native file as a new current version (old one in history).
5. **Un-skipping an "už importováno" row** imports it anyway (e.g. it went to the
   wrong person) — creating another history row.
6. Two people with the same name and birth date share one picker label; use the
   "více možností" buttons to pick the right one.
7. The file name for an exported native file is `<name>.pdf`.

## Which Google account reads the folder

`getDriveClient(eventId)` → `resolveDriveAuth` → `getDriveIdentity`: the connected
Google account of the user who saved that event's Drive folders
(`Event.driveConfiguredByUserId` → their `DriveAccount`), if that user is active and the
token is valid; otherwise the service account `DRIVE_SERVICE_ACCOUNT_EMAIL`. The dialog
shows the account in use after loading. The folder must be shared with that account
(reader is enough).

## Migrations / seeds / env vars

- No migration.
- `npx tsx scripts/seed-registration-slice7-i18n.ts` (cs + en), after the slice-6 seed.
- No new env vars.

Deploy = the seed, build + deploy.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`; `.next` deleted first for disk space).
- `npx tsx scripts/test-registration-slice7.ts` — diacritics, order, separators, noise
  words, multi-word names, two people with the same name (+ participant first), no
  match, last name only, folder link / id parsing.
- Still passing: all other `scripts/test-*.ts` and `src/lib/*.check.ts`.
- eslint on new/changed files: only the accepted pre-existing
  `react-hooks/set-state-in-effect` in `ListTemplateAdmin.tsx`.

## NOT tested (no DB, no Drive, no GCS, no browser here)

The Drive listing with the extra fields (incl. whether `sha256Checksum` is filled for
these files), `files.export`, the routes against a real DB, GCS writes, the dialog in
light and dark.

## Manual test checklist (Pavel)

- [ ] Before: an event with no "platí trvale" type shows no "Importovat z Drive"; bills Drive import still works.
- [ ] Šablony → Dokumenty: "Přihláška do oddílu" is "platí trvale". Event → Dokumenty → that type → "Importovat z Drive" (as admin; a non-admin doesn't see it).
- [ ] Paste the folder link → table; the account shown has access. A wrong link → "Toto není ID složky…"; a folder not shared → the usual Drive access message naming the account.
- [ ] `jan_novak.pdf` → ✓ Jan Novák; `scan_0042.pdf` → nespárováno, pick a person by typing; two Jan Nováks → více možností, both offered (the camp's one first).
- [ ] A .docx / a 20 MB file → přeskočeno with the reason; a Google Doc → exported, imported as PDF.
- [ ] "otevřít" opens the file in Drive.
- [ ] Importovat → progress, rows "importováno"; Lidé → the person → Trvalé dokumenty shows it as platný ("nahráno zde"), the previous one in history; events count it received.
- [ ] Load the same folder again → imported files "už importováno", skipped; Importovat imports nothing new.
- [ ] A failing file (e.g. removed from Drive between preview and import) shows its error; the others import.
