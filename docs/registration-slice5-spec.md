# Registration & membership — slice 5 spec (basic vs. detailed data, per-event requirements), 2026-10-05

Slices 1–4 are live. Read `docs/registration-slice4-spec.md` + its build summary first.
Same hard rules (opt-in/default = today's behaviour; no e-mail to a parent unless the
event is `accept_send` or a person clicks send + confirm; additive migrations via
`prisma migrate diff`; no production/gcloud; reuse existing code; Czech strings via a
seed script). Decisions are Pavel's (2026-10-05).

## Idea

Adults (leaders, supporters) need only a few details; children need full details, but
not up front. A profile has **basic** details (asked at first registration / membership)
and **detailed** ones (asked only when an event needs them). Answers given while
registering for an event are saved to the profile and reused next time. Events can also
ask their own one-off questions that are stored only on that registration.

## 1. Field metadata (org templates)

`ParticipantFieldTemplate` gets:
- `audience` enum `both | children | adults` (default `both`) — who the field applies to.
- `level` enum `basic | detailed` (default `basic` = today's behaviour: shown in the
  profile as now).
Editable as columns next to "Rodiče v portálu" in Šablony → Účastníci (and shown in the
event field settings for template fields, editing the template, like the portal column).

Audience applies everywhere a person's fields are shown or asked: portal profile, admin
person page, public form, renewal, registration step. An adult never sees children-only
fields and vice versa.

## 2. Per-event requirements

`EventParticipantField.requiredOnRegistration Boolean @default(false)` — "vyžadovat při
přihlášce", a column in the event's participant field settings.
- Template field: only possible when its portal access is `edit` or `approval` (otherwise
  the toggle is disabled with a hint "rodiče toto pole nevidí").
- Event-only field (no template): an **event question** — asked at registration, stored
  only on the participant (`customFieldValues`), never in the profile.

## 3. Portal registration step

"Přihlásit" → per person being registered, a form with the event's required fields that
apply to that person's audience:
- template fields pre-filled from the profile; event questions empty;
- all required → must be non-empty to submit;
- when any pre-filled **detailed** field is shown, a mandatory tick "Údaje jsou aktuální"
  (review + confirm);
- the optional note as today.
On submit: the participant gets the submitted values (they are the registration's answers);
template answers also go to the profile following each field's rule — `edit` applied
(and pushed as today), `approval` → a pending change in "Ke schválení" (same as a profile
edit). Event questions stay on the participant only. Renewal of membership and the public
form use the same step for the event's required fields (public form: basic + required
ones).

## 4. Portal profile: basic + detailed

Profile shows "Základní údaje" (level basic, audience-filtered) and a link/button to a
sub-screen "Podrobné údaje" (level detailed), same edit rules as now (edit / approval /
read; hidden never sent). Missing-required indicators: a detailed field required by an
upcoming registration of that person and empty is highlighted. Admin person page gets the
same split (both sections, all fields, any access). Grouping/order: template order; a
layout editor for the profile is NOT in scope (YAGNI) — say so in the summary.

## 5. Status function

Slice 4's `registrationState()` "missing" now also counts an empty field the event
requires for that person (audience-aware), instead of only required-in-registration
fields. Keep the slice-4 behaviour for events with no required fields.

## Deliverables

- Branch `registration-slice5` from `registration-slice4`; logical commits, pushed after each
  numbered section; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint on new files
  clean except the accepted `react-hooks/set-state-in-effect` pattern.
- `scripts/test-registration-slice5.ts`: audience filtering, required-field resolution per
  person, review-tick rule, answer routing (profile edit / pending / event-only), status
  "missing" with required fields; existing `scripts/test-*.ts` still pass.
- `scripts/seed-registration-slice5-i18n.ts` (cs + en).
- `docs/registration-slice5-build-summary.md`: built, assumptions, migrations + seeds,
  untested parts, manual test checklist.
