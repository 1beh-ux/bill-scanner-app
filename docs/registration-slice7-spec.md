# Registration & membership — slice 7 spec (bulk import of permanent documents from Drive), 2026-10-06

Slice 6 (permanent person documents) is live. Read `docs/registration-slice6-spec.md` and
its build summary first. Same hard rules as before (opt-in/default = today's behaviour; no
e-mail to anyone; additive migrations only if any are needed; no production/gcloud; reuse
existing code; Czech strings via a seed script).

## Why

Pavel has ~100 signed "platí trvale" registration forms from last year in one Google
Drive folder. File names are mixed: some contain the child's name, some don't
(`scan_0042.pdf`). He wants them in the people's profiles without uploading each by hand.

## Where

Event → document settings, on a document type that is a copy of a "platí trvale"
template: **"Importovat z Drive"**. It uses that event's Drive connection (the existing
helpers in `src/lib/drive.ts`: `listFilesInSubfolder`, `getDriveFileMeta`,
`downloadFileBuffer`, with their error handling / `drive-error-messages.ts`). The files go to
the **person store** (slice 6), not to the event — the event is only the Drive context.

## Flow

1. Paste a Drive folder link or id (accept both). List files directly in the folder (no
   recursion). Native Google files: export as PDF if simple via the Drive API, else list
   them as skipped with a reason. Same type/size limits as the admin upload.
2. **Match** each file name against **all people in Lidé** (not only the event's
   participants): strip extension, lower-case, remove diacritics, split on non-letters,
   drop common noise words (`prihlaska`, `scan`, `img`, digits…); a person matches when
   both first and last name tokens are present, any order. One match → suggested; several
   → "více možností", the admin picks; none → unmatched. Prefer the event's participants
   only to order the choices, never to hide others.
3. **Preview table**, one row per file: file name with an "otevřít" link (Drive
   `webViewLink`), status (✓ / více možností / nespárováno / už importováno / přeskočeno),
   a person picker (searchable select over Lidé, prefilled with the suggestion), and a
   skip toggle. Files whose content hash already exists as a person document of that type
   for any person show "už importováno" and are skipped by default.
4. **Confirm** imports the rows with a person, **in batches from the client** (e.g. 10 files
   per request, progress shown) so no request runs long on Cloud Run. Each file becomes the
   person's current document of that type exactly like an admin upload on the person page
   (reuse that code path: GCS copy under the person, replaces the current one, history
   kept); source = admin import. A failing file is reported in its row and doesn't stop
   the rest.
5. Re-running is safe (already-imported files are recognised by hash).

The matching function is pure (no DB) in `src/lib/` so the self-check can test it.

## Deliverables

- Branch `registration-slice7` from `registration-slice6`; logical commits, pushed;
  messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint on new files
  clean except the accepted `react-hooks/set-state-in-effect` pattern.
- `scripts/test-registration-slice7.ts`: name matching (diacritics, order, separators,
  noise words, two people with the same name, no match, folder link/id parsing);
  existing `scripts/test-*.ts` still pass.
- `scripts/seed-registration-slice7-i18n.ts` (cs + en).
- `docs/registration-slice7-build-summary.md`: built, assumptions, deploy steps, untested
  parts, manual test checklist.
