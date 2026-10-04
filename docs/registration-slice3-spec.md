# Registration & membership — slice 3 spec (families, members, prices, portal v2), 2026-10-04

Read first: `docs/registration-membership.md` (slice 1), `docs/registration-portal-spec.md`
+ `docs/registration-portal-build-summary.md` (slice 2, live in production since
2026-10-04). This file is the source of truth for slice 3; decisions below were made by
the product owner (Pavel). Anything not covered: pick the simplest option that keeps the
hard rules and list it under "Assumptions" in the build summary.

## Hard rules (unchanged from slice 2, one amended)

1. **Opt-in, default off.** With no new setting touched, everything behaves exactly as
   today (including current member/non-member pricing and today's portal).
2. **E-mail (amended):** nothing reaches a parent automatically **unless that specific
   event is explicitly set to auto-send** (section E). Every other send stays
   preview + explicit confirm. A parent may trigger a re-send of their own documents
   from the portal (section F) — that is the parent's click, using the event's existing
   template unedited, throttled.
3. Additive migrations only, made with `prisma migrate diff --from-schema <old copy>
   --to-schema prisma/schema.prisma --script` (no local DB). Never touch production/gcloud.
4. Reuse existing systems (fields + layouts, email templates + accept flow, document
   generation/storage, QR/VS). Match surrounding style; Czech UI strings via a seed script.
5. Read `AGENTS.md` + `node_modules/next/dist/docs/` for routing; the auth gate is `src/proxy.ts`.

## A. Members = people (adults too)

Adults register as members too (leaders, supporters), not only children.
- Keep the `Child` model/table (no rename — no destructive migration), add
  `isAdult Boolean @default(false)`. In the UI the Děti page becomes "Lidé" (people /
  members) with a child/adult filter; children stay the default view. Adults can be
  registered for events like children (membership year mainly).
- An adult member may also be a guardian of children in the same family (link by e-mail
  is enough: a guardian e-mail equal to an adult member's e-mail = same person, shown
  once in the family view).

## B. Families (households), one portal link per family

- `Family` (id, name e.g. "Novákovi", portalToken unique, created/updated) and
  `Child.familyId` (nullable). A person is in at most one family.
- Family portal link `/p/<familyToken>` shows every member of the family (switcher /
  cards) with everything slice 2 shows per child. **Existing per-child links keep
  working** (child token → that child only). Birth-date gate per family: any member's
  birth date passes; cookie scoped to the family token (same HMAC pattern).
- Suggestions: people sharing a guardian e-mail are proposed as one family on the Lidé
  page ("Navržené rodiny"); the admin confirms/edits (add/remove member, rename, merge
  families). Never auto-create families without confirm.
- Link tools (copy / new link / send with preview+confirm) move to the family level;
  per-child ones stay for children without a family.

## C. Price rules (generic, per event, default = today)

`Event.priceRules Json?` — null = today's behaviour exactly (memberPriceCzk /
nonMemberPriceCzk by isMember). When set:
- **Categories**: list of `{ key, label, forAdults: bool, forChildren: bool, priceCzk,
  memberPriceCzk?, schoolYearPriceCzk?, householdDiscountCzk? }`. Price = memberPriceCzk
  when the person is a member (isMember, incl. confirmed membership) and it's set, else
  priceCzk. So an event can be membership-only (one category with member/non-member
  prices = today's behaviour), category-only, or combined.
- **Category per participant**: `Participant.priceCategory String?` — chosen in the
  registration form (only categories allowed for that person's adult/child status), editable
  by admin on the participant detail. Missing → first allowed category.
- **School-year price**: `schoolYearFrom` (MM-DD, default "09-01"): a registration created on
  or after that date in the event's year uses schoolYearPriceCzk when the category has one.
- **Household discount**: `householdMinMembers` (default 2). When ≥ that many persons of the
  same Family have a (pending or accepted, active) registration in the event, every one of
  them gets its category's householdDiscountCzk — **counted across the whole event/year,
  retroactively** — but never on a school-year price. Price stays computed live (as
  today). Because an acceptance e-mail may already have carried the old amount, the admin
  roster shows a flag "cena se změnila po odeslání" with old/new amount for participants
  whose current price differs from the amount in their last acceptance send (store the sent
  amount on send), so the admin can tell the parent / refund the difference.
- Effective price feeds everything that already uses `effectivePriceCzk` (columns,
  documents, e-mails, QR, portal payment). VS formula unchanged; one payment per member.
- Admin UI: event settings → "Ceny" section: simple mode (today) / rules mode with the
  category editor, school-year date, household minimum; a preview table of example
  combinations.
- **Configure 2026/2027 membership like this** (put it as a one-click preset "Členství
  (výchozí)" in the editor): categories `oddil` "Dítě registrované na oddíl" (children,
  1300, school-year 650, household −200) and `ostatni` "Ostatní členové (dospělí, děti
  mimo oddíl)" (adults + children, 500, no school-year price, household −100); school
  year from 09-01; household minimum 2. Self-check these: 1 oddíl child = 1300; 2 oddíl
  siblings = 1100 + 1100; oddíl child + adult = 1100 + 400; 2 oddíl siblings from
  September = 650 + 650; 1 adult alone = 500.
- Which oddíl: when an event has an "Oddíl" choice (a select participant field the admin
  picks in price settings as `oddilFieldKey`), the form asks it for `oddil` category.
  Just a field — no separate oddíl model.

## D. Membership year: public landing page + renew

- Membership-year (and optionally any connected) event gets `publicRegistration Boolean
  @default(false)`, a slug, and landing content (`landingContent` markdown/rich text
  edited in event settings: info, prices, rules). Public page `/r/<slug>` (outside the
  auth gate): landing info + **new-family form**: 1+ adults and/or 1+ children; shared or
  separate address and other details (a "same as first person" toggle per block); guardians
  for children; price category per person (allowed ones only) and the live price preview
  incl. household discount. Fields shown = org fields with portalAccess ≠ hidden (same
  rules as portal), required ones marked via a new `requiredInRegistration` flag on the
  template.
- Submit creates a Family (unconfirmed flag `needsReview`), the persons and pending
  participants. Possible duplicates (same name+birth date, or a guardian e-mail already
  known) are **not** merged automatically: the admin sees them in "Ke kontrole" on Lidé
  and links/merges. Spam: honeypot + per-IP rate limit; max 10 persons per submit.
- After submit: confirmation screen (and, only if the event is set to auto-send, the
  automatic mail per E; otherwise nothing is sent).
- Existing families renew from their portal: the membership year shows "Obnovit
  členství" with all family members pre-filled, pick who, category per person, live
  price, confirm.

## E. Auto-accept per event

`Event.autoAccept` enum: `manual` (default, today) | `accept` (portal/public registrations
become accepted automatically, nothing sent) | `accept_send` (accepted + documents
generated + the acceptance e-mail sent with the event's existing template unedited, via the
same code path as "Přijmout a odeslat"). Applies only to registrations from the portal /
public page, never to imports or manual adds. Event settings show a clear warning text for
`accept_send`. Log every automatic send like a normal send (sender = the event's sending
account; if none configured, fall back to `accept` and flag it to the admin).

## F. Portal v2 — "Moje přihlášky" and layout

- Wider, two-column layout on desktop (profile/family left, registrations right), one
  column on phone.
- Per registration: event basics (name, dates, place, short info from the event), approval
  status, document status per document type (sent to you / received from you / missing),
  re-download, **"Poslat znovu e-mailem"** (re-sends the acceptance e-mail + documents with
  the existing template, no editing, to the guardians; max 3 per day per registration),
  payment block (as now), price category.
- **Upload instead of e-mail**: document types get `allowPortalUpload` (in the event's
  document-type settings, default off). Upload (pdf/jpg/png, ≤ 15 MB) marks the document
  received (`receivedVia` new value `portal`), stored like other received documents,
  visible to admin in document status.
- What the registration card shows is configurable per event in event settings with the
  **same layout editor used for the participant detail** (`participant-layout.ts`
  pattern): sections, which fields/blocks, order. Default layout = the list above.

## G. Already done before this slice

Same name + birth date never auto-merged (`planLinks` in `src/lib/children.ts`, commit
`0b59d10`) — keep it working with families and the public form.

## H. Deliverables

- Branch `registration-slice3` from `registration-portal`; logical commits; push after
  each section. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint clean on new
  files except the accepted `react-hooks/set-state-in-effect` pattern.
- Assert self-checks (`npx tsx scripts/test-*.ts`, no DB): price rules incl. all five
  examples above + retro household + school-year exclusion; family gate; public-form
  validation; auto-accept mode selection. Existing `test-membership.ts` and
  `test-registration-portal.ts` keep passing.
- `scripts/seed-registration-slice3-i18n.ts` (cs + en).
- `docs/registration-slice3-build-summary.md`: built, assumptions, migrations + seeds +
  any env vars, untested parts, manual test checklist for Pavel.
