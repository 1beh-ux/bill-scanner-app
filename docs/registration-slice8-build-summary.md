# Registration & membership — slice 8 (portal add / leave, selective linking): build summary, 2026-10-06

Spec: `docs/registration-slice8-spec.md`. Earlier: `docs/registration-slice5-spec.md`,
`docs/registration-slice6-spec.md`, slice 5–7 build summaries. Branch `registration-slice8`.
Not merged, not deployed.

## Opt-in guarantee (still holds)

With nothing touched the app behaves as before:

- Every event is `peopleLinkMode = all` → `linkChildren` creates missing people exactly as
  before (the "Odpojit od Lidé" filter moved from the query into `planLinks`, same result).
- Nobody is inactive (`leftAt` null) → eligibility, the portal, the roster, Lidé and the
  link e-mails give the same result; the only visible additions are the new buttons
  ("Přidat člena rodiny" on family links, "Už nebude chodit", the Lidé filter, the
  person-page toggle, the roster bulk action, the event-settings radio).
- E-mail: nothing new is sent. Adding a member, leaving / restoring, the admin toggle and
  "Propojit s Lidmi" send nothing; the "Poslat odkaz do portálu" button only opens the
  existing compose page (send = its button + confirm, as before).

## What was built

| Spec | Where |
|---|---|
| 1. add a family member | Family links only: "Přidat člena rodiny" in the family card (`PortalApp.tsx` `AddMember`) → `POST /api/portal/<token>/members` → `addFamilyMember()` (`portal-server.ts`). Child / adult, first + last name, birth date, adult's e-mail + phone, the fields from `memberFormFields()` (`public-registration.ts`: basic templates with portal access edit / approval, required = `requiredInRegistration`, audience-filtered). Checked by the public form's `validateSubmission` (one person + guardians). A child's guardians are pre-filled from a child member's guardians (else the family contacts), editable. Creates the `Child` in the family (no participant, no membership), sets `family.needsReview = true` (Lidé → Rodiny → "Ke kontrole"). Rate limit `member:<familyId>` 10 / day (`takeRateSlot`). A person's own link: route 404, no button. |
| 1. public form | No "add to an existing family" (anyone could attach to a family) — not built, per spec. |
| 2. leave | `Child.leftAt` / `leftNote` / `leftVia` (`portal` / `admin`). Portal: "Už nebude chodit" under the profile → confirm + optional note → `POST /api/portal/<token>/leave` `{ memberId, leave: true, note }`; inactive people leave the family chips for a folded "Neaktivní (n)" section with "Obnovit" (`leave: false` clears all three columns). Pure helpers `isActivePerson` / `leftData` / `linkRecipients` (`portal-rules.ts`). |
| 2. not registrable | `eligibilityFacts()` drops inactive people → the portal's open events, `registerFromPortal` and the event-settings eligibility preview all skip them. |
| 2. roster | Participant whose person left: "Odhlášen(a) rodičem <date>" (portal) / "Neaktivní v Lidech od <date>" (admin) under the status chip (table + mobile). Nothing removed. |
| 2. Lidé | Badge "Neaktivní", a filter (Aktivní i neaktivní / Aktivní / Neaktivní; default hides nobody), person page toggle "Neaktivní" (`PATCH /api/children/<id>` `{ inactive }`, `leftVia = admin`) with since / by whom / note. "Smazat" unchanged. |
| 2. link e-mails | `loadTarget()` (`portal-email.ts`): an inactive person is no target; a family sends only to its active members' guardians (none active = no target). The compose page shows "neaktivní vynecháno: n"; Lidé "Poslat odkaz (…)" counts only active people and says how many were skipped; the per-row "Poslat odkaz" is hidden for inactive people. Covers both the link and the yearly invitation template (same compose). |
| 3. link mode | `Event.peopleLinkMode` (`all` / `existing`). `linkChildren(where, { createMissing? })`: per participant `createMissing ?? event.peopleLinkMode === "all"`; `planLinks` skips unlinked events and creates a person only when some candidate of the group may create. Every caller follows: table sync + adding participants (`linkChildrenIfConnected`), switching the connection on, Lidé "Propojit" (`linkChildren({})` per event). Event settings → Portál rodičů: radio "Koho propojovat s Lidmi" under the connection switch. |
| 3. roster bulk | Selected → "Propojit s Lidmi" (admins; hidden for "Odpojit od Lidé" events) → `POST /api/events/<id>/participants/bulk` `{ action: "link" }` → `linkChildren(..., { createMissing: true })`, returns linked / created / not linked + the targets (family link when in a family). Then "Poslat odkaz do portálu (n)" → the existing `/children/compose` with those targets. |

## Assumptions / behaviour changes (spec silent → simplest option)

1. **Add-member fields**: basic + portal access `edit` or `approval` (the public form also
   shows `read` fields; the spec says "fields parents may edit"). Values are stored straight
   into the new profile, `approval` ones too (like the public form) — the family is
   flagged for review anyway.
2. **Add-member rate limit** counts attempts (incl. invalid ones), 10 per family a day.
3. **Inactive people are never eligible** — also in the admin's eligibility preview
   (event settings). Registrations stay; the admin can still add an inactive person to an
   event by hand.
4. **Family link e-mail**: an inactive member's guardians get nothing unless they are also
   a guardian of an active member. "Poslat odkaz do portálu" after "Propojit s Lidmi"
   passes all targets; the compose page skips inactive ones and shows the count.
5. **Mixed match group** (same new person in an `all` event and an `existing` event, one
   "Propojit" run): the `all` event creates the person, the `existing` event's participant
   links to it too (the person exists then).
6. **Lidé "Nepropojení" list** leaves out participants of `existing` events (they are
   kept out of Lidé on purpose); link them via the roster's "Propojit s Lidmi".
7. **Switching a connected event back to `all`** links its participants right away (same
   as switching the connection on); switching to `existing` unlinks nobody.
8. "Propojit s Lidmi" works on any event that isn't "Odpojit od Lidé", connected or not
   (the link only matters once connected). Ambiguous matches / no birth date stay
   unlinked and are reported ("Nepropojeno").
9. Roster badge text for an admin-marked person: "Neaktivní v Lidech od <date>" (the
   spec's "Odhlášen(a) rodičem" would be wrong there).
10. Leaving / restoring in the portal is not rate-limited (like profile edits).

## Migrations (additive, `prisma migrate diff --from-schema`)

1. `20261011090000_slice8_person_left` — enum `PersonLeftVia`; `children.left_at`,
   `left_note`, `left_via` (all nullable).
2. `20261011100000_slice8_people_link_mode` — enum `PeopleLinkMode`;
   `events.people_link_mode` NOT NULL DEFAULT `all`.

Both safe to run before the new code is live.

## Seeds / env vars

- `npx tsx scripts/seed-registration-slice8-i18n.ts` (cs + en), after the slice-7 seed.
- No new env vars.

Deploy = the two migrations, the seed, build + deploy.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`; `.next` deleted first for disk space).
- `npx tsx scripts/test-registration-slice8.ts` — add-member field selection (basic,
  edit/approval), validation (audience, required per audience, adult e-mail, child
  guardian, birth date), leave/undo → registrability + note, link-e-mail recipients skip
  inactive, link mode (existing never creates / all creates / unlinked skipped / mixed).
- Still passing: all other `scripts/test-*.ts` and `src/lib/*.check.ts`.
- eslint on new files clean; changed files only show their pre-existing
  `react-hooks/set-state-in-effect` and older warnings.

## NOT tested (no DB, no browser here)

Both migrations and all Prisma queries, the portal add-member form / leave / Neaktivní
section, the Lidé filter + badge + person toggle, the roster badge and bulk link, the
event-settings radio, the compose skip count — in light and dark.

## Manual test checklist (Pavel)

Before switching anything on:
- [ ] Connected camp: adding a participant / table sync / Lidé "Propojit" link and create people as before.
- [ ] Portal (family + person link) and Lidé look as before apart from the new buttons.

Add member (1):
- [ ] Family link → "Přidat člena rodiny" → child: guardians pre-filled; required fields marked; submit → member appears in the portal; Lidé → Rodiny → "Ke kontrole" shows the family. No e-mail.
- [ ] Adult without e-mail / child without guardian / future birth date → error, nothing created.
- [ ] A person's own link has no button.

Leave (2):
- [ ] Portal → "Už nebude chodit" → note → Potvrdit → the person is under "Neaktivní", not among open events; Obnovit brings them back.
- [ ] Roster of an event they're registered in: "Odhlášen(a) rodičem <date>".
- [ ] Lidé: badge, filter Neaktivní; person page shows "od …, označil(a) rodič v portálu: <note>"; untick / tick the toggle (admin).
- [ ] Lidé: select an active and an inactive person → "Poslat odkaz (1, …) · neaktivní vynecháno: 1"; compose of a family with one inactive member doesn't list that member's own guardian.

Link mode (3):
- [ ] Event settings → Portál rodičů → "Jen stávající osoby" → save. Import / add participants: a member links (member price), a new kid stays unlinked and isn't created in Lidé; Lidé "Propojit" doesn't create them either and they're not under "Nepropojení".
- [ ] Roster → select the new kid → "Propojit s Lidmi" → "Propojeno: 1 (nově v Lidech: 1)" → "Poslat odkaz do portálu (1)" → compose; nothing is sent until Odeslat + confirm.
- [ ] An "Odpojit od Lidé" event: no "Propojit s Lidmi" button.
