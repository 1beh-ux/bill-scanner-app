# Registration & membership — slice 5 (basic vs. detailed data, per-event requirements): build summary, 2026-10-05

Spec: `docs/registration-slice5-spec.md`. Earlier: `docs/registration-slice4-spec.md`,
`docs/registration-slice4-build-summary.md`. Branch `registration-slice5` (from
`registration-slice4`). Not merged, not deployed.

## Opt-in guarantee (still holds)

With no new setting touched the app behaves as before:

- Every template is `audience = both`, `level = basic` → the portal profile, admin
  person page and public form show the same fields as today (the portal profile
  just gets a "Základní údaje" heading; the "Podrobné údaje" button appears only
  when some field is detailed).
- Every event field is `requiredOnRegistration = false` → no registration step, no
  review tick, the register request is the same as before; the status function
  gives exactly the slice-4 result.
- E-mail: nothing new is sent. Answers routed to `approval` fields become pending
  changes (as a profile edit does); nobody is notified.

## What was built

| Spec | Where |
|---|---|
| 1. audience + level | `ParticipantFieldTemplate.audience` (`both / children / adults`), `.level` (`basic / detailed`). Columns "Pro koho" / "Údaje" next to "Rodiče v portálu" in `ParticipantFieldAdmin.tsx` (org scope edits the field; event scope edits the template, admins only, like the portal column). Template PATCH validates both. Pure helper `appliesTo()` in `src/lib/registration-fields.ts`. |
| audience everywhere | Portal profile + slice-4 required check (`portal-server.ts` `portalData`), public form (shown per person in `PublicForm.tsx`, enforced in `validateSubmission`), registration step and renewal (`askedFields`), admin person page, admin roster status. |
| 2. per-event required | `EventParticipantField.requiredOnRegistration`, column "Vyžadovat při přihlášce" (event scope). Template field: enabled only when the template is `edit` / `approval`, otherwise disabled + "rodiče toto pole nevidí". Event-only field: "otázka akce — uloží se jen k přihlášce". PATCH `/api/events/<id>/participant-fields/<fieldId>` accepts it (custom fields only). |
| 3. registration step | `askedFields` / `checkAnswers` / `needsReviewTick` / `routeAnswers` (pure). `portalData` sends `available[].steps[memberId]` (fields pre-filled, tick flag); `PortalApp.tsx` `RegistrationStep` under each picked person; submit disabled until filled (+ tick). `registerFromPortal` re-checks everything (400 `{ error: "invalid", fields }` → nothing created), creates the participant with all answers, then `updateProfile` for `edit` answers (pushed as today) and `proposeChange` for `approval` ones. Renewal = the same "Available" flow. |
| 3. public form | `publicFormContext`: visible templates that are basic, plus the detailed ones the event requires, plus the event questions (`eventOnly`). Event-question answers go to the participant only (`createPublicRegistration`), never into `Child.fieldValues`. |
| 4. profile split | Portal: "Základní údaje" + button "Podrobné údaje →" (sub-screen, same save / edit rules). A field an upcoming registration requires and that is empty is highlighted ("Vyžaduje přihláška: <akce>"), with a count on the button. Admin person page: "Základní údaje" (built-ins + basic) and "Podrobné údaje". |
| 5. status | `askedMissing()`; portal cards (`portalData`) and the admin roster (`/api/events/<id>/participants`) OR it into `requiredEmpty` of `registrationState()`. |

**Not built (YAGNI, per spec):** a layout editor for the profile. Field order is the
existing template order (alphabetical by label in the portal and admin page); the
registration step follows the event's field order.

## Assumptions (spec silent → simplest option)

1. **Review tick** = some *detailed profile* field in the step is shown with a
   non-empty pre-filled value. Empty detailed fields (nothing to review) and basic
   fields / event questions don't trigger it. It's per person.
2. **Pre-fill = what the parent sees**: the live value, or their own pending proposal.
   An `approval` answer becomes a pending change only when it differs from that
   (unchanged → nothing; changed back to the live value → withdraws the proposal, as
   in the profile). An `edit` answer is applied only when it differs from the live value.
3. **The participant gets the submitted answer even for `approval` fields** (spec: the
   answers are the registration's). If the admin rejects the change, the participant
   keeps the answer; the profile keeps the old value.
4. **Ano/Ne fields in the step**: an unticked box is the answer "Ne" (always counts as
   filled). The public form keeps its slice-3 behaviour for required Ano/Ne fields
   (the server rejects an untouched box) — not changed here.
5. Event field ↔ template matched by key, active templates only (as slice-4 assumption
   10); an event field whose template is inactive is an event question. A template field
   marked required whose portal access later becomes `read`/`hidden` is simply not asked
   and not counted (the flag stays stored; the checkbox shows disabled).
6. Labels in the step: template label for profile fields, event label for event questions.
7. **Status**: missing = slice-4 `requiredInRegistration` check (now audience-aware) **or**
   an empty event-required field. Profile fields are read from the linked person's
   profile; participants without a person: their own values, and only fields for both
   audiences (the person's age group is unknown). Event questions always from the
   participant.
8. Public form: a template that is `requiredInRegistration` *and* `detailed` is shown
   only when the event requires it (detailed = not asked up front). "Stejné údaje jako
   osoba 1" copies only the fields that apply to person 1 as well; the rest stay asked.
9. The portal highlight also marks a *basic* field when an event requires it and it's
   empty (spec mentions detailed; same rule, cheaper than excluding). `requiredBy` names
   the first upcoming registration's event.
10. Admin person page: audience-filtered, but a field with a stored value is always shown
    (never hide data from the admin). The seed renames its "Profil" heading to
    "Základní údaje" (`childProfile.profileTitle`).
11. "Vyžadovat při přihlášce" is an event setting — editable by anyone who may edit the
    event's fields; "Pro koho" / "Údaje" edit the org template — admins only.
12. The portal profile PATCH isn't audience-restricted server-side (the UI never sends
    a field the person doesn't have; the per-field portal rule still applies).

## Migrations (additive, `prisma migrate diff --from-schema`)

1. `20261007090000_slice5_field_audience_level` — enums `FieldAudience`, `FieldLevel`;
   `participant_field_templates.audience` (default `both`), `.level` (default `basic`).
2. `20261007100000_slice5_required_on_registration` —
   `event_participant_fields.required_on_registration` (default false).

All NOT NULL with defaults = today's behaviour. Safe to run before the new code is live.

## Seeds / env vars

- `npx tsx scripts/seed-registration-slice5-i18n.ts` (cs + en). Run **after** the
  slice-4 seed (it overwrites `childProfile.profileTitle`).
- No new env vars.

Deploy = the two migrations, the seed, build + deploy (same as slice 4).

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`; `.next` deleted first for disk space).
- `npx tsx scripts/test-registration-slice5.ts` — audience filtering, required-field
  resolution per person (hidden/read templates skipped, adults/children, event
  questions, builtins ignored), review-tick rule, answer checks (required, invalid
  select/date, Ano/Ne), routing (edit / pending / event-only, own pending proposal),
  status "missing" incl. unlinked participants, public-form audience validation.
- Still passing: `test-blank-pages.ts`, `test-membership.ts`, `test-registration-portal.ts`,
  `test-registration-slice3.ts`, `test-registration-slice4.ts`, `src/lib/*.check.ts`.
- eslint on new/changed files: only the accepted pre-existing
  `react-hooks/set-state-in-effect` (`ParticipantFieldAdmin.tsx`, `PortalApp.tsx`,
  `children/[id]/page.tsx`).

## NOT tested (no DB, no browser here)

All Prisma queries and both migrations, the portal registration step / profile
sub-screen / highlight in a browser (light + dark), the field settings columns, the
public form with event questions, the admin person page split, pushes and pending
changes created by the step.

## Manual test checklist (Pavel)

Before switching anything on:
- [ ] Portal profile, admin person page, public form: same fields as before; registering in the portal works as before (no extra step, no tick).
- [ ] Event roster status filter: same counts as before.

Field settings (1–2):
- [ ] Šablony → Účastníci: "Pro koho" and "Údaje" columns; set "Alergie" to *jen děti* + *podrobné*, "Řidičský průkaz" to *jen dospělí*.
- [ ] Event → participant fields: the same two columns for template fields (edits the template); "Vyžadovat při přihlášce": tick "Alergie"; a template field with "skryté" access shows the disabled box + "rodiče toto pole nevidí"; add an event-only field "Odjezd autobusem" and tick it ("otázka akce").

Portal (3–5):
- [ ] Child profile shows basic fields; "Podrobné údaje →" opens the detailed ones; an adult doesn't see "Alergie", a child doesn't see "Řidičský průkaz".
- [ ] Přihlásit on that event: per child "Údaje pro přihlášku" with Alergie (pre-filled) + "Odjezd autobusem" (empty); can't submit until filled; with Alergie pre-filled the tick "Údaje jsou aktuální" is required.
- [ ] After submit: participant has both answers; the profile has the new Alergie (edit → applied; approval → "Ke schválení" on the Lidé/person page); "Odjezd autobusem" is not in the profile.
- [ ] Renewal of membership with a required field: same step.
- [ ] An existing registration of that event whose child has Alergie empty: status "Chybí údaje nebo dokumenty" in the portal and the roster; the profile highlights Alergie ("Vyžaduje přihláška: …", count on "Podrobné údaje").
- [ ] Public form of that event: basic fields + Alergie (children only) + "Odjezd autobusem"; the new person's profile has Alergie, not the bus answer; the registration has both.

Admin (4):
- [ ] Person page: "Základní údaje" and "Podrobné údaje" sections; an adult's page doesn't show children-only fields unless they hold a value.
