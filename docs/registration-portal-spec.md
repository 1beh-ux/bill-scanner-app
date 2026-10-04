# Registration & membership — slice 2 spec (parent portal), 2026-10-04

Read first: `docs/registration-membership.md` (slice 1, already live). Concept doc
(Claude Docs, "Registration & Membership Module (concept)") is summarised here; this
file is the source of truth for slice 2. Decisions below were made by the product
owner (Pavel) on 2026-10-04. Do not re-open them; anything not covered: pick the
simplest option that keeps the hard rules, and list it under "Assumptions" in the
build summary.

## Hard rules (non-negotiable)

1. **Opt-in, always.** With nothing switched on, the app must behave exactly as
   before. Every new behaviour is gated on `Event.registrationConnected` /
   `Event.kind = membership` / new flags that default to OFF. The org must be able to
   finish this module and still decide never to use the portal. New per-field portal
   access defaults to `hidden`.
2. **No e-mail is ever sent automatically.** Every send goes through the existing
   compose/preview + explicit confirm pattern (see `ComposeEmailModal`,
   `src/app/events/[id]/participants/compose`, `participant-bulk-email.ts`). Email
   remains the system of record; the portal only mirrors. Nothing may exist ONLY in
   the portal.
3. **Migrations additive only** (expand/contract: no drops/renames). Write them with
   `npx prisma migrate diff --from-schema <old copy> --to-schema prisma/schema.prisma --script`
   (there is no local DB). Every schema change ships with its migration (a git hook
   checks this: run `bash scripts/hooks/install.sh` once).
4. **Never touch production** (no DB, no deploy, no gcloud). Build, test, commit, push.
5. Next.js in this repo has breaking changes vs. training data — read
   `node_modules/next/dist/docs/` for anything routing/middleware related (auth gate is
   `src/proxy.ts`, not middleware.ts).
6. Reuse what exists (fields system, email templates, QR/VS/price in
   `document-variables.ts`, Gmail sending, document storage). Match surrounding code
   style; Czech UI strings via a seed script (`scripts/seed-*-i18n.ts` pattern, keys
   used through `t()`), Czech only for the portal for now.

## A. Fix: membership shown on participant detail/lists

In a connected event, the price/VS already use the confirmed membership
(`isMember` + `memberChildIds`), but the membership custom field (key
`event.vsMembershipFieldKey ?? "clenstvi_zare"`) still displays the manual "Ne".
Make the displayed value reflect `isMember()` wherever it is shown (detail page,
roster columns, documents via `fieldTextValues`): e.g. show "Ano" with a small
"potvrzené členství {year}" hint when membership comes from the membership event.
Don't overwrite the stored manual value.

## B. Child profile data

- `Child` gets profile data: `fieldValues Json?` keyed by `ParticipantFieldTemplate.key`
  (org-wide field definitions — the same keys participants use in
  `customFieldValues`), plus guardians (`ChildGuardian` table mirroring
  `ParticipantGuardian`: name, email, relationship, phone, receivesCommunications).
- **Initial data: copied once from the child's most recent participation** (latest
  event start date): its customFieldValues (template keys only) + guardians. Do it
  when a Child is created by linking, plus a one-off "Doplnit profily z poslední akce"
  action on the Děti page for existing children with empty profiles.
- Admin child detail page `/children/[id]`: view/edit profile (all fields, any
  access), guardians, linked events, portal link tools (F), pending changes (D).
  Děti list rows link to it.

## C. Per-field portal rule

`ParticipantFieldTemplate.portalAccess` enum: `edit` (parent edits, live
instantly) | `approval` (parent edit becomes a pending change) | `read` (parent sees,
can't edit) | `hidden` (default). Set in the existing template admin UI (Templates →
participant fields). Built-ins: first/last name + birth date = `approval`; guardians
= `edit`.

## D. Pending changes (approval)

- `ChildChange`: childId, fieldKey (or a guardian marker), oldValue, newValue, status
  (pending/accepted/rejected), createdAt, decidedById, decidedAt.
- While pending, the old value stays live everywhere (profile, events, meds grid).
- "Ke schválení (N)" section on the Děti page (with counter) and on the child detail:
  old vs new side by side, Accept / Reject. Accept applies to the profile and pushes (E).
- A newer parent edit of the same field replaces the older pending one.

## E. Push profile → upcoming events

Whenever a profile value actually changes (admin edit, parent `edit` field,
accepted change): write it to every linked Participant whose event is `status =
active` AND `registrationConnected = true`, only for keys the event has as an
EventParticipantField (name/DOB to the participant's own columns, keeping `name`
in sync via `fullNameFrom`). Closed events are never touched (history). Guardians:
update by email match, add new ones, never delete (ParentEmailLog references them).

## F. Parent link (token)

- `Child.portalToken String? @unique` — 32+ chars from `crypto.randomBytes`
  (base64url), not derived from anything. Generated on demand.
- Admin (Děti list + child detail): **copy link**, **new link** (regenerate = old one
  dies immediately, with confirm), **send link by email** → opens the existing-style
  compose/preview with an editable template (new purpose key `portal_link`, org default
  editable at Templates → E-mail, variables incl. `{{portal_link}}`, child name), and
  sends only after explicit confirm; bulk send for selected children the same way.
  Recipients: the child's guardians with receivesCommunications. Use the sending
  account pattern of the existing Gmail send code (investigate `gmail-client.ts`,
  `parent-email-send.ts`; for an org-level send without an event, use the sending
  admin's own connected account — document the choice). Log sends.
- Portal base URL: `PORTAL_BASE_URL` env var, falling back to the request origin. Don't
  hard-code a single portal domain anywhere (multi-tenant custom domains later).

## G. Portal (public, no login)

- Route `/p/[token]/...`, excluded from the Firebase auth gate in `src/proxy.ts`;
  portal API under `/api/portal/[token]/...`, also public, each request resolves the
  token → child, unknown token = 404 with no detail. Never log tokens.
- **Birth-date gate, once per device:** first visit asks the child's birth date; on
  success set an httpOnly, secure, SameSite=Lax cookie (1 year) holding an HMAC
  (server secret env `PORTAL_SECRET`) of child id + current token, so regenerating the
  token also invalidates devices. All portal data endpoints require it. Throttle wrong
  attempts (e.g. ≤10/hour per child, stored in DB).
- Portal shows (mobile-first, same visual language as the app):
  1. **Profile**: fields per `portalAccess` (hidden ones not even sent to the
     client), guardians; edits per rule; pending ones shown as "čeká na schválení".
  2. **Available events** (eligibility, H) with **Přihlásit**: review pre-filled
     profile + optional note → creates a `pending` Participant in that event (fields
     from profile for the event's keys, guardians, childId, note stored in a new
     nullable `Participant.portalNote`, shown on the participant detail). No duplicate
     registration for the same child + event. The admin accepts exactly as today.
  3. **My registrations**: status per event (Čeká / Přijato); once accepted: price,
     bank account, variable symbol and the QR Platba image (reuse
     `document-variables.ts`), and the documents already sent/received for that
     participant (reuse existing document storage/download; check access by token +
     gate + ownership).
  4. **History**: past events of the child.
- Portal never sends e-mail and never holds anything the e-mail didn't also carry.

## H. Eligibility + opening an event in the portal

- `Event.portalOpen Boolean @default(false)` ("Otevřeno pro přihlášky v portálu"),
  only meaningful when connected. Hidden after `registrationDeadline` (existing field).
- `Event.eligibility Json?`: `{ everyone?: boolean, birthYearFrom?, birthYearTo?,
  groups?: string[], attendedEventIds?: string[], childIds?: string[] }`.
  Rule: eligible = everyone OR childIds includes child OR (at least one criterion set
  AND every set criterion matches: birth year in range; child's group — the
  groupName of their most recent participation — in groups; child has an *accepted*
  participation in any of attendedEventIds). Empty/null = nobody.
- Admin UI in event settings → "Registrace a členství": the switch, criteria editor
  (birth years, group multi-select from existing groupNames, past events
  multi-select, individual children via the same datalist picker), live count of
  eligible children with the names expandable.
- Membership year rollover: nothing special — a new membership event each year with
  its own eligibility (e.g. "attended membership 2026" or everyone).

## I. Deliverables

- Branch `registration-portal` (from `planning-module`), logical commits, pushed
  often. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit`, `npx next build` pass; eslint clean on new files (existing
  repo-wide `set-state-in-effect` pattern is accepted).
- Small assert-based self-checks (`scripts/test-*.ts`, run with `npx tsx`, no DB):
  eligibility rule, gate HMAC/throttle logic, token generation, push key filtering.
- `scripts/seed-registration-portal-i18n.ts` with every new UI string (cs + en).
- `docs/registration-portal-build-summary.md`: what was built, assumptions made,
  new env vars (`PORTAL_SECRET`, `PORTAL_BASE_URL`) and how to set them on Cloud Run,
  migrations + seed scripts to run at deploy, what was NOT tested (no DB/browser),
  a manual test checklist for Pavel.
