# Registration & membership — slice 2 (parent portal): build summary, 2026-10-04

Spec: `docs/registration-portal-spec.md`. Slice 1: `docs/registration-membership.md`.
Branch `registration-portal` (from `planning-module`). Not merged, not deployed.

## Opt-in guarantee (still holds)

With nothing switched on the app behaves as before:

- New field rule `ParticipantFieldTemplate.portalAccess` defaults to `hidden`;
  `Event.portalOpen` defaults to false; `Event.eligibility` null = nobody.
- No portal link exists until an admin copies/sends one (tokens are created on demand).
- Profile → event push only touches participants of events that are `active`
  AND `registrationConnected`. Unconnected and closed events are never written.
- The membership "Ano" display (A) only happens where slice 1 already used the
  confirmed membership (connected events).
- The only always-on change: when linking creates a new Child, its profile is
  filled from its latest participation (writes the Child/ChildGuardian tables only).
- No e-mail is sent automatically anywhere. The only new send is the portal
  link, from a compose/preview page after an explicit confirm dialog.

## What was built

| Spec | Where |
|---|---|
| A. membership shown as confirmed | `confirmedMembershipKey()` in `src/lib/document-variables.ts`; used by `fieldTextValues` (documents, e-mails, Zdraví detail, composites), the roster and Mail roster routes (shows "Ano"), and the participant detail (`/api/participants/[id]/core` → "Ano" + "potvrzené členství {year}" chip). The stored manual value is untouched. |
| B. child profile | `Child.fieldValues` (keyed by `ParticipantFieldTemplate.key`), `ChildGuardian`. Copied once from the latest participation: `copyProfileFromLatest()` in `src/lib/children.ts` (on child creation by linking, the "Nová" link action, and "Doplnit profily z poslední akce" on the Děti page — only empty profiles). Admin detail `/children/[id]` (`src/app/children/[id]/page.tsx`, API `src/app/api/children/[id]/route.ts`); Děti rows link to it. |
| C. per-field portal rule | `PortalAccess` enum (`edit/approval/read/hidden`, default hidden); select per field in Šablony → Účastníci (org scope of `ParticipantFieldAdmin`). Built-ins fixed in `src/lib/portal-rules.ts`: first/last name + birth date = approval, guardians = edit. |
| D. pending changes | `ChildChange`; `proposeChange()` / `decideChange()` in `src/lib/child-profile.ts`. One pending row per child+field (newer edit replaces it; editing back withdraws it). "Ke schválení (N)" on the Děti page and child detail (`src/components/children/PendingChanges.tsx`), old vs new, Schválit / Zamítnout. |
| E. push to upcoming events | `pushProfile()` in `src/lib/child-profile.ts`; key filtering is the pure `pushPatch()` in `portal-rules.ts`. Built-ins go to the participant's own columns (`name` kept in sync via `fullNameFrom`), others into `customFieldValues`; guardians matched by e-mail (case-insensitive) → updated / added, never deleted. |
| F. portal link | `Child.portalToken` (`crypto.randomBytes(32)` base64url, 43 chars, `src/lib/portal-gate.ts`). Děti list: copy / new / send per child + bulk send for the ticked rows; child detail: the same. Send = `/children/compose` (template `portal_link`, org default editable in Šablony → Zdraví → E-mail, vars `{{child_name}}`, `{{portal_link}}`, `{{sender_name}}`, `{{signature}}`, `{{sender_email}}` + the child's profile keys), filled preview per child, confirm dialog, then `src/lib/portal-email.ts`. Logged per recipient in `ChildEmailLog` (shown on the child detail). |
| G. portal | Page `/p/[token]` (`src/app/p/[token]/page.tsx` + `PortalApp.tsx`), API `/api/portal/[token]` (+ `/gate`, `/profile`, `/register`, `/documents/[docId]`), server logic `src/lib/portal-server.ts`. Both prefixes are public in `src/proxy.ts`; the sidebar is hidden there. |
| H. eligibility | `Event.portalOpen`, `Event.eligibility`; rule `isEligible()` in `portal-rules.ts`. Editor `src/components/events/PortalSettings.tsx` under Nastavení akce → Akce → "Registrace a členství" (shown for connected events and membership years), live count with names (`/api/events/[id]/portal-eligibility`). |

Portal details:

- Unknown token → plain 404 (page and API), no detail. Tokens are never logged;
  the page sets `referrer: no-referrer` and `noindex`.
- Birth-date gate once per device: cookie `portal_<childId>` (httpOnly, secure,
  SameSite=Lax, 1 year) = HMAC-SHA256(`PORTAL_SECRET`, childId + current token).
  New link ⇒ old link 404s and every device must pass the gate again. Wrong
  attempts: 10 per hour per child (fixed window, stored on `Child`), then 429.
  A child without a birth date on file can't pass the gate.
- Profile: built-ins + active org fields with access ≠ hidden (hidden ones are
  never sent). `edit` saves live and pushes; `approval` creates a pending change
  ("Čeká na schválení: … (platí zatím: …)"); `read` shown only. Guardians are
  editable (at least one required).
- Přihlášky na akce: events with `portalOpen`, `status = active`, connected or a
  membership year, deadline not passed, eligible, and no participation of the
  child yet. Přihlásit → review (name, birth date, guardians) + optional note →
  pending Participant (profile values for the event's custom field keys, the
  guardians, `childId`, `portalNote`). The admin accepts exactly as today. The
  note shows on the participant detail and the child detail.
- Moje přihlášky: current registrations (active, not ended, connected/membership
  events) — Čeká / Přijato; once accepted AND a variable symbol was assigned (the
  acceptance send did it): price, account, VS, QR Platba (existing
  `resolvePaymentQrImage`), plus the participant's stored documents (generated =
  "posláno vám", others "přijato od vás"), downloaded through the portal API
  with token + gate + ownership check.
- Historie: the child's other (ended/closed) events, names and dates only.

## Assumptions (spec silent → simplest option)

1. **Org-level sending account:** the portal-link e-mail goes from the sending
   admin's own connected mailbox — the `MailSenderAccount` whose address is the
   admin's login e-mail, else the one they connected most recently. No mailbox →
   the compose page says so and nothing is sent.
2. Portal-link sends are logged in a new `ChildEmailLog` (ParentEmailLog needs a
   participant + participant guardian, which a child-level send doesn't have).
3. Built-in profile fields reuse the fixed field keys `participant_first_name`,
   `participant_last_name`, `datum_narozeni` (that is also what `ChildChange.fieldKey`
   holds), so pushes land in the same-keyed fields. Their rule is fixed in code
   (approval), not configurable. Group is not a profile field (it is per event).
4. Guardians are always `edit`, so no guardian change ever needs approval (no
   guardian marker in `ChildChange` was needed).
5. Push target = exactly `status = active AND registrationConnected = true`
   (spec E). A membership-year event that is not switched to connected is
   therefore not updated by profile changes (it can still be opened in the portal).
6. Portal registration is allowed for connected events and membership years
   (`kind = membership` always links children, slice 1); `portalOpen` is ignored
   on other events and the switch is only shown for those two.
7. "Group" for eligibility = groupName of the child's most recent participation
   that has a group (a fresh registration has none yet and would otherwise hide
   the group). "Attended" = accepted AND active participation.
8. Deadline: visible up to and including the `registrationDeadline` day.
9. Payment block only after the registration number (VS) exists — before that
   the e-mail hadn't carried payment details either (portal mirrors only).
10. Registrations tab lists only connected/membership events; History lists every
    past linked event (names/dates only).
11. Merging duplicate children now also merges profiles: the kept profile wins,
    empty fields + new guardian e-mails come from the merged ones, the send log
    moves; the merged child's pending changes are dropped.
12. Parent edits to `approval` fields are compared against the live value; an
    accepted change applies its new value even if an admin edited the field meanwhile.
13. The compose page hands over the selected children through sessionStorage
    (like the participant compose page).
14. `PORTAL_SECRET` shorter than 16 chars or missing ⇒ portal answers 503 ("není
    dostupný") instead of running with a weak key.

## New environment variables

- `PORTAL_SECRET` (required for the portal to work): random, ≥ 16 chars, never
  change it casually (changing it logs every device out). Store as a secret:
  ```
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets create portal-secret --data-file=-
  gcloud secrets add-iam-policy-binding portal-secret \
    --member=serviceAccount:1050716617948-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
  gcloud run services update bill-scanner-app --region=europe-west3 --update-secrets=PORTAL_SECRET=portal-secret:latest
  ```
  (The member must be the service's runtime account — the one that already reads
  `db-url-secret`; the compute default account above is an assumption, check
  with `gcloud run services describe bill-scanner-app --region=europe-west3`.)
  `--update-secrets` keeps it across later `gcloud builds submit` deploys (they
  only add/update their own list). Optionally also append
  `PORTAL_SECRET=portal-secret:latest` to `--update-secrets` in `cloudbuild.yaml`
  once the secret exists (not done here: a reference to a missing secret would
  fail the deploy).
- `PORTAL_BASE_URL` (optional): public origin for portal links, e.g.
  `https://portal.example.cz`. Unset = the origin the admin is using (from the
  forwarded host header). Set with
  `gcloud run services update bill-scanner-app --region=europe-west3 --update-env-vars=PORTAL_BASE_URL=https://…`
  (and add it to `--update-env-vars` in `cloudbuild.yaml`, or it stays as set).

## Deploy steps

1. `prisma/migrations/20261004120000_registration_portal/migration.sql` — additive
   only (2 enums, new nullable/defaulted columns, 3 new tables, a unique index on
   `children.portal_token` — all existing values are NULL so it can't fail).
   Safe to run before the new code is live.
2. Translations: `npx tsx scripts/seed-registration-portal-i18n.ts` (116 keys, cs + en;
   the portal reads the `portal.*` keys' Czech text).
3. Set `PORTAL_SECRET` (above) — can be done before or after the deploy.
4. Build + deploy as usual (`gcloud builds submit --config=cloudbuild.yaml …`).

Same shape as `~/deploy-registration.sh`, with
`npx tsx scripts/seed-registration-portal-i18n.ts` instead of the slice-1 seed.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass
  (build run with dummy `DATABASE_URL`/`NEXT_PUBLIC_FIREBASE_*`).
- `npx tsx scripts/test-registration-portal.ts` — eligibility rule, push key
  filtering, access levels, gate throttle + birth-date match, token format and
  uniqueness, gate HMAC (incl. new token ⇒ old cookie invalid).
- `npx tsx scripts/test-membership.ts` — still passes.
- eslint on all new/changed files: only the accepted `react-hooks/set-state-in-effect`
  pattern (plus pre-existing findings in untouched parts of `events/[id]/page.tsx`).

## NOT tested (no DB, no browser here)

Nothing ran against a database or in a browser: every Prisma query, the
migration itself, the push, the merge transaction, Gmail sending, GCS document
download, cookies across real devices, the `PORTAL_BASE_URL`/forwarded-host
link building on Cloud Run, and all UI. Migration SQL was generated by
`prisma migrate diff` from the previous schema, not applied.

## Manual test checklist (Pavel)

Before anything is switched on:
- [ ] An existing camp: participant list, detail, documents, acceptance e-mail — unchanged.
- [ ] Šablony → Účastníci: each field shows "Portál: skryto".

Profiles (Děti):
- [ ] "Doplnit profily z poslední akce" → a child's detail shows fields + guardians from its latest event.
- [ ] Child detail: change a field the connected upcoming event has → the participant in that event shows it; a closed event and an unconnected event are unchanged.
- [ ] Change the first name → participant first name AND full name updated in the connected event.
- [ ] Guardians: edit phone → same-e-mail guardian updated in the event; add one → added there; remove one → still in the event.

Membership display (A):
- [ ] Connected camp, child with accepted membership for the year, manual field "Ne": list/detail/Mail list show "Ano", detail shows "potvrzené členství 2026", generated document shows Ano; the manual value is still "Ne" after saving the detail.

Portal link + e-mail (F):
- [ ] Without `PORTAL_SECRET`: link opens "Portál teď není dostupný".
- [ ] Kopírovat odkaz → open in a private window → asks for birth date; wrong date ×10 → "Příliš mnoho pokusů"; right date → portal; reopen → no question.
- [ ] Nový odkaz (confirm) → old link 404; new link asks for the birth date again on the same device.
- [ ] Šablony → Zdraví → E-mail: "Odkaz do portálu rodičů" template editable.
- [ ] Tick 2 children → "Poslat odkaz do portálu (2)" → preview shows the real link (or "(odkaz se vytvoří při odeslání)") → Odeslat → confirm → parents receive it; child detail lists "Odeslané odkazy". With no connected mailbox of your own: the page says so, the button is disabled.

Portal (G/H):
- [ ] Šablony → Účastníci: set one field `úprava`, one `úprava se schválením`, one `jen ke čtení`. Portal shows exactly those (+ name/birth date + guardians); hidden ones absent.
- [ ] Edit the `úprava` field → visible at once on the child detail and in the connected event.
- [ ] Edit the approval field and the surname → "Čeká na schválení"; Děti page "Ke schválení (2)"; old value still everywhere; Schválit → applied + pushed; Zamítnout → gone, old value stays. Edit twice → only the newer pending row.
- [ ] Connected camp, Nastavení → Registrace a členství: "Otevřeno pro přihlášky v portálu" + criteria (birth years / group / attended membership 2026 / one child by name) → live count + names match.
- [ ] Portal "Přihlášky na akce" lists it only for eligible children; after the deadline it disappears.
- [ ] Přihlásit → note → Odeslat → pending participant in the roster with guardians + fields + the note on its detail; the event disappears from the list (no duplicate).
- [ ] Accept via the normal acceptance e-mail → portal "Moje přihlášky": Přijato, price, account, VS, QR (scan it); generated documents downloadable.
- [ ] Historie shows past events.
- [ ] Mobile phone: all four tabs usable.
