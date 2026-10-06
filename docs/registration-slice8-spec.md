# Registration & membership — slice 8 spec (portal: add / leave; selective linking), 2026-10-06

Slices 1–7 are live. Read `docs/registration-slice5-spec.md`, `docs/registration-slice6-spec.md`
and the slice 5–7 build summaries first. Same hard rules (opt-in/default = today's
behaviour; no e-mail to a parent unless the event is `accept_send` or a person clicks send
+ confirm; additive migrations via `prisma migrate diff`; no production/gcloud; reuse
existing code; Czech strings via a seed script). Decisions are Pavel's (2026-10-06).

## 1. Portal: add a family member

On a **family** portal link: "Přidat člena rodiny" → first name, last name, birth date,
child/adult, plus the **basic** profile fields parents may edit for that audience (same
rules and validation as the public form's person block — reuse `validateSubmission` /
`src/lib/registration-fields.ts`; required-in-registration fields required). Guardians:
pre-filled from an existing family member, editable. Creates a `Child` in that family
(no participant, no membership) and sets `family.needsReview = true` so it shows under
"Ke kontrole" in Lidé. Nothing is sent. Rate-limit like other portal writes.
A person's own (non-family) link does not get this button. The public form does NOT get
"add to an existing family" (anyone could attach to a family) — note in the summary.

## 2. Portal: "Už nebude chodit" (person leaves)

Per person in the portal: "Už nebude chodit" + confirm (+ optional note). Sets new
`Child.leftAt` / `leftNote` / `leftVia` (`portal` | `admin`). Effects:
- Portal: the person moves to a collapsed "Neaktivní" section with "Obnovit" (undo
  clears leftAt); cannot be registered while inactive.
- Nothing is deleted automatically. Registrations stay; in the event roster a participant
  whose person has `leftAt` shows a badge "Odhlášen(a) rodičem <date>" so the admin decides
  (remove from the event, refund…).
- Lidé: badge "Neaktivní", a filter "Neaktivní" (and the default list hides nobody — just
  the badge), admin can also mark/unmark ("Neaktivní" toggle on the person page,
  `leftVia = admin`). Admin can then delete with the existing Lidé "Smazat" (rules there unchanged).
- Lidé "Poslat odkaz" and the yearly invitation skip inactive people (say so in the compose
  count).
Allowed for anyone, member or not (a confirmed member just gets the same badge — the admin
handles membership).

## 3. Selective linking of an event's participants to Lidé

New `Event.peopleLinkMode` enum `all | existing` (default `all` = today):
- `all`: today — connected event links every participant, creating missing people.
- `existing` ("jen stávající osoby"): auto-linking (table sync, adding participants,
  switching the connection on, Lidé's "Propojit") links participants only to people who
  already exist in Lidé (e.g. members, so member prices work); it never creates a person.
  Implement as an option on `linkChildren` (`createMissing`) chosen per event; Lidé's
  global "Propojit" respects each event's mode (and slice-7 `peopleUnlinked`).
Setting in Event settings → Portál rodičů (radio, under the connection switch).

Roster: bulk action on selected participants "Propojit s Lidmi" — links them (creating the
person when missing, regardless of mode; `peopleUnlinked` events: action hidden) and then
offers "Poslat odkaz do portálu" → the existing portal-invitation compose with those
people's targets (family link if in a family). Nothing is sent without that compose +
confirm. Membership/price stays what it is: only an accepted membership year makes a member.

## Deliverables

- Branch `registration-slice8` from `registration-slice7`; logical commits, pushed after each
  numbered section; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint on new files
  clean except the accepted `react-hooks/set-state-in-effect` pattern.
- `scripts/test-registration-slice8.ts`: add-member validation (audience, required),
  leave/undo effects on registrability, link mode (existing never creates; all creates;
  unlinked event skipped), invitation skip of inactive; existing `scripts/test-*.ts` pass.
- `scripts/seed-registration-slice8-i18n.ts` (cs + en).
- `docs/registration-slice8-build-summary.md`: built, assumptions, migrations + seeds,
  untested parts, manual test checklist.
