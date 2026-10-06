# Registration & membership — slice 6 (permanent documents on the person): build summary, 2026-10-06

Spec: `docs/registration-slice6-spec.md`. Earlier: `docs/registration-slice4-spec.md`,
`docs/registration-slice4-build-summary.md`, `docs/registration-slice5-build-summary.md`.
Branch `registration-slice6`. Not merged, not deployed.

## Opt-in guarantee (still holds)

With no template ticked "platí trvale" the app behaves as before:

- `profileDocuments()` returns nothing when no template is permanent (or the
  participant isn't linked to a person), so every count, status, e-mail checklist,
  sheet export and portal card gets exactly the slice-5 result.
- No person document is ever created: promotion checks the permanent flag first.
- The participant detail gets "Nahrát soubor" and "Zobrazit" (the newest received
  file) per document type. Upload = a new, explicit admin action; nothing else changes.
- E-mail: nothing new is sent. Turning the setting on, uploads, revokes send nothing.

## What was built

| Spec | Where |
|---|---|
| 1. "platí trvale" | Stored as `ListTemplate.data.permanent` (like the other document-type settings). Šablony → Dokumenty: a checkbox per template, set through `POST /api/list-templates/<id>/permanent` (admins). Event copies are matched by `key`. The regular template form keeps the flag. |
| 1. "vyžadovat nový" | `EventListItem.data.requireNew`, a checkbox in the event's document-type form, shown only for types whose key is a permanent template's; the list shows "platí trvale" / "… zde vyžadovat nový". |
| 2. person store | `PersonDocument` (person, `docKey`, `gcsPath` / `contentHash` / filename, `sourceParticipantDocumentId`, `sourceEventId`, created at/by, `revokedAt/By`). Current = newest not revoked (`currentPersonDoc`). `src/lib/person-documents.ts`: `promoteToPersonDocument()` after an approved portal upload (`/api/events/<id>/documents/<docId>` approve), a Pošta attachment save (`…/mail/messages/<id>/execute`) and the admin upload. Rule `canBecomePersonDocument` (pure): a file, received (not generated, not in review). Merging people moves their person documents. |
| 3. admin upload | Participant detail → "Nahrát soubor" per type → `POST /api/events/<id>/participants/<pid>/documents/<typeId>/upload` (`receivedVia = manual`, with file, counts at once; promoted when permanent). Person page → "Trvalé dokumenty" → "Nahrát soubor" → `POST /api/children/<id>/documents`. Same checks as the portal upload (`readUploadedFile`: PDF/JPG/PNG by content, 15 MB); the portal upload now uses the same helpers (`participant-document-store.ts`). |
| 4. counting | `profileDocRows()` (pure, `registration-status.ts`) makes covered types into rows with `receivedVia = "profile"`, so `countsAsReceived` / `docState` / `registrationState` count them. They're added in `getReceivedItemIds` (status e-mails + preview, Pošta reply checklist, sheet export, Documents overview), the roster (counts "Dokumenty x/y" + status filter), the participant detail ("z profilu (<akce>)" links to the person's file, no toggle), the Documents overview ("z profilu", no toggle) and the portal cards ("Máme z profilu (<akce>)", no upload; the upload endpoint refuses it too). |
| 5. revoke | Person page lists current + history per type with Zobrazit / Stáhnout / "Neplatí" (confirm) → `POST /api/children/<id>/documents/<docId>` `{action:"revoke"}`. |
| 6. turning it on | Ticking shows a preview (`GET …/permanent` → count) in the confirm dialog, then `POST` creates the person documents (`backfillPicks`: per person without a current one, the newest received file). Unticking: confirm, flag off, rows stay (the person page shows them as "už neplatí trvale"). |

## Assumptions (spec silent → simplest option)

1. **Templates without a key.** Templates made in the UI have no key, nor do their
   event copies. Ticking "platí trvale" gives the template its id as key and sets the
   same key on its event copies (`isFromTemplate`, same name — the rule the template
   sync already uses). A copy renamed in an event isn't matched. The preview counts
   these copies by name before the key exists.
2. **The file is copied** to `people/<childId>/documents/…` (GCS copy) — deleting the
   participant deletes its own files (`participant-delete.ts`), the person's stays.
3. **Revoking** marks the chosen row and every older non-revoked row of that type —
   otherwise the replaced file would become current again instead of "missing". The
   check is live: past events show the type missing too (no snapshot).
4. **A file in a "vyžadovat nový" event** still becomes the person's new current
   document (it is a newer real file of the same type).
5. **Backfill skips manual rows.** Before this slice a manual row with a file is a
   generated document ticked by hand (the toggle upgrades the generated row in place) —
   a blank form, not a signed one. Admin uploads (also manual) become person documents
   when uploaded. Rows already used as a source are skipped (a revoked one stays revoked).
6. A received type that is also covered by the profile keeps its own toggle on the
   participant detail (only "profile only" shows a plain "Přijato" badge); the
   Documents overview shows "z profilu" whenever the profile covers it.
7. Portal: "Máme z profilu (<akce>)" without a download link (the parent's file is
   only for the admin; the portal download endpoint serves participant documents only).
8. The person's file opened from an event (participant detail) is allowed for admins and
   for users with health/mail access to that event if the person takes part in it.
9. The table (sheet) sync tick still adds its `sheet` row when the profile already
   covers the type (it only counts newly ticked rows); harmless, not changed.
10. Generation on acceptance (document merge) is unchanged — a permanent type covered
    by the profile is still generated/attached if set to auto-attach.

## Drive sync

Not built for person documents (spec: not required). Drive sync still mirrors
participant documents as before; a person document's file lives only in GCS.

## Migrations (additive, `prisma migrate diff --from-schema`)

1. `20261009090000_slice6_person_documents` — table `person_documents` (+ index
   `child_id, doc_key`, FKs to children, events SET NULL, users SET NULL).

New table only. Safe to run before the new code is live.

## Seeds / env vars

- `npx tsx scripts/seed-registration-slice6-i18n.ts` (cs + en), after the slice-5 seed.
- No new env vars.

Deploy = the migration, the seed, build + deploy (same as slice 5). Nothing is
permanent until an admin ticks a template.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`; `.next` deleted first for disk space).
- `npx tsx scripts/test-registration-slice6.ts` — received rule (permanent /
  vyžadovat nový / revoked / unlinked / event-only / unticked), registration state
  with a profile document, what may become a person document (tick-only, sheet,
  generated, in review, rejected vs. e-mail / approved / admin upload), replacement and
  revoke order, backfill selection.
- Still passing: all other `scripts/test-*.ts` and `src/lib/*.check.ts`.
- eslint on new/changed files: only the accepted pre-existing
  `react-hooks/set-state-in-effect` (`ListTemplateAdmin.tsx`, `children/[id]/page.tsx`,
  participant detail, Documents overview, `PortalApp.tsx`).

## NOT tested (no DB, no GCS, no browser here)

All Prisma queries and the migration, GCS copy/upload/download, the key assignment on
ticking, the backfill on real data, every UI (template checkbox + preview dialog,
event "Vyžadovat nový", participant detail upload / "z profilu", person page list /
upload / Neplatí, Documents overview badge, portal card) in light and dark.

## Manual test checklist (Pavel)

Before switching anything on:
- [ ] Existing camp: roster counts, status filter, Documents overview, status e-mail preview, sheet export, portal cards — unchanged.
- [ ] Participant detail: "Nahrát soubor" a PDF → the type is received ("ručně označeno"), "Zobrazit" opens it; a .txt is refused.

Setting (1, 6):
- [ ] Šablony → Dokumenty → tick "platí trvale" on "Přihláška do oddílu" → dialog with the number of people → confirm → "Vytvořeno …: N". Lidé → a person with a received e-mailed/approved Přihláška shows it under "Trvalé dokumenty" ("z akce …", platný).
- [ ] A person whose Přihláška was only ticked (no file) or only generated has nothing ("Chybí").

Counting (4):
- [ ] New event (or "Synchronizovat ze šablon") with that type: a linked child with a person document — roster "Dokumenty" counts it, status not "missing" for it, participant detail "z profilu (<akce>)" opens the file, Documents overview "z profilu", status e-mail checklist doesn't ask for it, sheet export shows it received, portal card "Máme z profilu (…)" with no upload button.
- [ ] Event → document types → edit the type → "Vyžadovat nový" → all of the above show it missing again for that event only.
- [ ] An unconnected camp participant (not linked to a person): unchanged.

New files (2, 3):
- [ ] Portal upload of that type in a "vyžadovat nový" event → approve → person page shows the new one as platný, the old one in history.
- [ ] Pošta: save an e-mail attachment as that type → becomes the person's current document.
- [ ] Person page → "Nahrát soubor" → current.

Revoke (5):
- [ ] Person page → "Neplatí" → confirm → every event (also past ones) counts it missing; the portal asks for an upload again.
- [ ] Untick "platí trvale" → events stop counting; the person page shows the documents "už neplatí trvale".
