# Registration & membership — slice 6 spec (permanent documents on the person), 2026-10-06

Slices 1–5 are live. Read `docs/registration-slice4-spec.md`, `docs/registration-slice5-spec.md`
and both build summaries first. Same hard rules (opt-in/default = today's behaviour; no
e-mail to a parent unless the event is `accept_send` or a person clicks send + confirm;
additive migrations via `prisma migrate diff`; no production/gcloud; reuse existing code;
Czech strings via a seed script). Decisions are Pavel's (2026-10-06).

## Idea

Some documents (e.g. "Přihláška do oddílu") are signed once and stay valid for years; only
payment is yearly. Such a document is stored **on the person** (Child) once, and every
event that asks for the same document type counts it as received.

## 1. Setting: "platí trvale"

A document type template (org `ListTemplate` of the document-type kind) gets "platí
trvale" (store it the way other document-type settings are stored). Event document types
copied from that template are matched to it by their template `key` — that is how the
same document is recognised across events. Event-only document types (no template key)
can't be permanent.

Per event, a permanent document type can be set to **"vyžadovat nový"** (this event
ignores the stored file and asks for a new one).

## 2. Person document store

New model (e.g. `PersonDocument`): person (Child), document-type key, the file (GCS path,
hash, original filename — reuse the participant-document storage helpers), source
(participant document / event it came from, or admin upload), created at/by, and
`revokedAt`/`revokedBy`. History is kept: the current one is the newest non-revoked row.

**Only a real file counts. A tick without a file never becomes a person document.**
A generated document (`receivedVia = generated`, unsigned) never does either.

A person document is created when, for a person-linked participant, a document of a
permanent type with a file becomes received: an approved portal upload, an e-mail
attachment saved via Pošta, a table/manual path that attaches a file, or the new admin
upload (3). A newer one replaces the current one (old kept in history).

## 3. Admin upload

"Nahrát soubor" on the participant detail per document type (event side): stores the file
like other participant documents (`receivedVia = manual`, with file), counts as received.
Also on the person page (Lidé → person) per permanent document type: uploads straight to
the person store. Same file-type/size limits as the portal upload.

## 4. Counting as received

For a participant linked to a person, a permanent document type (not "vyžadovat nový" in
that event) counts as received when the person has a current (non-revoked) person
document — regardless of event dates. Integrate into the slice-4 shared filter
(`src/lib/registration-status.ts` `RECEIVED_WHERE` / `countsAsReceived`) so every place
follows: roster counts and "Dokumenty x/y", document overview, status function and
filter, status e-mails / reply checklist, sheet export, portal cards. Show it as
"z profilu (<event name of origin>)"; view/download opens the person's file. The portal
does not ask to upload it. Participants not linked to a person: unchanged.
Drive sync: not required for person documents — say so in the summary.

## 5. Revoke

Person page lists permanent documents (current + history) with view/download and
"Neplatí" (confirm). Revoked → every event counts it as missing again from then on (the
check is live, so past events show it missing too — note this in the summary; don't
snapshot).

## 6. Turning it on for existing data

Ticking "platí trvale" on a template shows a preview first: how many people would get a
person document from their existing **file-backed**, received, non-generated
participant documents of that type (newest per person), then on confirm creates them.
Unticking stops counting person documents for that type (rows stay).

## Deliverables

- Branch `registration-slice6` from `registration-slice5`; logical commits, pushed after each
  numbered section; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint on new files
  clean except the accepted `react-hooks/set-state-in-effect` pattern.
- `scripts/test-registration-slice6.ts`: received rule (permanent / require-new / revoked /
  unlinked / tick-only / generated), replacement order, backfill selection; existing
  `scripts/test-*.ts` still pass.
- `scripts/seed-registration-slice6-i18n.ts` (cs + en).
- `docs/registration-slice6-build-summary.md`: built, assumptions, migrations + seeds,
  untested parts, manual test checklist.
