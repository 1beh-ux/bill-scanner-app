# Registration & membership — slice 3: build summary, 2026-10-04

Spec: `docs/registration-slice3-spec.md`. Earlier slices: `docs/registration-membership.md`,
`docs/registration-portal-build-summary.md`. Branch `registration-slice3` (from
`registration-portal`). Not merged, not deployed.

## Opt-in guarantee (still holds)

With no new setting touched the app behaves as before:

- `Event.priceRules` null (default) → `effectivePriceCzk` is exactly the old
  member / non-member formula (self-checked). The "cena se změnila po odeslání"
  flag only appears in events that have price rules.
- `Event.autoAccept` defaults to `manual`; portal/public registrations stay pending.
- `Event.publicRegistration` defaults to false; `/r/<slug>` is a 404 until switched on.
- `Child.isAdult` false, `familyId` null for everyone; families are only created
  by an admin's confirm or by the public form (which is off).
- Document types: `allowPortalUpload` off.
- E-mail: nothing reaches a parent automatically unless the event is set to
  `accept_send`. The portal "Poslat znovu e-mailem" is the parent's own click
  (template unedited, max 3/day per registration).

What does change visibly without settings: the Děti page/nav is now "Lidé"
(text via the seed) with a children/adults filter (children by default) and the
Rodiny section; the parent portal (already opt-in per link) has the new
two-column layout (spec F).

## What was built

| Spec | Where |
|---|---|
| A. members = people | `Child.isAdult`; Lidé filter (`src/app/children/page.tsx`), "Dospělý člen" switch on the person detail. An adult's own e-mail = their first guardian row (`ownEmail()` in `portal-rules.ts`). |
| B. families | `Family` (+ gate throttle) and `Child.familyId`. `/p/<token>` resolves a child token (that child only, as before) or a family token (all members) — `loadScope`/`portalScope` in `src/lib/portal-server.ts`; any member's birth date passes; cookie `portal_f_<familyId>` = HMAC of `f_<familyId>` + current token. Lidé → "Navržené rodiny" (`suggestFamilies`: shared guardian e-mail, transitively) + "Rodiny" (rename, add/remove member, merge, dissolve, copy/new/send family link) in `src/components/children/Families.tsx`, API `src/app/api/families/route.ts`. Contacts shown once (`familyContacts`). Family link send = the same compose page / template / confirm (`src/lib/portal-email.ts`, target id `family:<id>`). |
| C. price rules | `src/lib/price-rules.ts` (pure): categories, member price, school-year price, household discount, preset "Členství (výchozí)", `previewPrices`. `effectivePriceCzk` uses it; household size counted live per Family across the event (`priceContext()` in `src/lib/children.ts`, attached by `withMembers`). `Participant.priceCategory` (portal/public pick, editable on the participant detail), `Participant.acceptedPriceCzk` (stored when an acceptance e-mail goes out) → roster + detail flag. Editor: Nastavení akce → Akce → "Ceny" (`src/components/events/PriceSettings.tsx`). |
| D. public page | `/r/<slug>` (`src/app/r/[slug]`), API `/api/public/r/<slug>`; settings in "Registrace a členství" (`PublicRegistrationSettings.tsx`). Validation `src/lib/public-registration.ts` (pure), creation `src/lib/public-registration-server.ts`. Honeypot, max 5 valid submits / hour / hashed IP (`src/lib/portal-rate.ts`, table `portal_rate_hits`), max 10 people. Required fields: `ParticipantFieldTemplate.requiredInRegistration` (Šablony → Účastníci, shown for fields visible in the portal). Lidé → "Ke kontrole": public-form families with possible duplicates (same name + birth date, or a known guardian e-mail) → "Je to tentýž člověk — sloučit" (existing merge) / "Zkontrolováno". Renewal: portal "Obnovit členství". |
| E. auto-accept | `Event.autoAccept`; `src/lib/auto-accept.ts` (`autoAcceptPlan` pure + `autoAcceptRegistrations`), called only by the portal register and public submit routes. `accept_send` = `sendBulkParticipantEmail(markAccepted)` with `resolveEmailTemplate(…, registration_acceptance)` — the "Přijmout a odeslat" path. Setting + warning in `PortalSettings.tsx`. |
| F. portal v2 | `src/app/p/[token]/PortalApp.tsx`: left profile/family, right registrations of all members (phone: one column). Card per registration laid out by `Event.participantLayout.portal` (`resolvePortalLayout` in `participant-layout.ts`; editor `PortalCardLayout.tsx` built from the `LayoutEditor` pieces). New `Event.location` / `Event.portalInfo` for the card. Document status per type (sent / received / missing), re-download, upload (`/api/portal/<token>/upload`, `receivedVia = portal`), re-send (`/api/portal/<token>/resend`). |

## Assumptions (spec silent → simplest option)

1. **School-year date** = the first `schoolYearFrom` (MM-DD) *after the event's
   start date*, not literally "in the event's year": identical for any event that
   starts before that date (e.g. a calendar-year membership starting 01-01), and
   it keeps a September-starting school year from giving everyone the half price.
2. Household = people of the same `Family` with an **active** registration
   (pending or accepted) in that event, the person included. People without a
   family are a household of one. Discount is never applied to a school-year price.
3. A category not allowed for the person (e.g. `oddil` for an adult) falls back to
   the first allowed one (spec: "missing → first allowed"); no category fits → price null.
4. "Oddíl" question: a category flag `asksOddil` (preset: `oddil`) + the event's select
   field chosen as `oddilFieldKey`; the answer is stored in the participant's (and the
   new person's profile) value of that field.
5. Public form: new people count as non-members for the preview (the stored price is
   computed live afterwards). Adults need an e-mail (it becomes their own guardian
   row); children get the adults ticked "je zákonným zástupcem" + extra guardians.
   "Same details as person 1" copies the org-field values (not name/birth date);
   off by default. Family name = the first person's surname (renamed during review).
6. Rate limit counts **valid** submits only (a parent fixing typos isn't locked out).
   IPs are stored only as an HMAC (keyed by `PORTAL_SECRET`).
7. `accept` (without send) only flips the status — no VS is assigned and no
   payment block appears in the portal until an acceptance e-mail is sent (the
   portal still mirrors e-mails only).
8. Auto-send / re-send account = `Event.senderEmail`'s connected `MailSenderAccount`;
   the log's sender (`sentByUserId`) is the user who connected that mailbox. No such
   account → plain accept, and event settings show a red warning (`autoSendReady`).
   Auto-send runs inline in the request (not `after()`): Cloud Run's request-based
   CPU would throttle work after the response.
9. Re-send = the acceptance send with `markAccepted` (regenerates documents, as the
   "Přijato" chip in the roster does) for accepted registrations only; it also
   updates the stored "sent amount".
10. Family link sends are logged in `ChildEmailLog` under every member whose
    guardians include that address. A child in a family keeps its own link tools on
    its detail page; the Lidé list shows them per family.
11. Merging a public-form person into an existing one: the kept person keeps their
    family (or takes the merged one's); a family left empty is deleted.
12. Portal card: the event name (and the member's name on a family link) is always the
    card header; the "event" block adds dates, place, info and the parent's note.
    Every block can be hidden; own sections show chosen event fields read-only.
13. `ParticipantDocument.receivedByUserId` became nullable (portal uploads have no
    receiving user); the FK keeps `ON DELETE RESTRICT`.
14. Uploads: type decided by file content (PDF/PNG/JPEG magic bytes), 20 per
    registration per day; saved under the same GCS path convention as e-mailed
    attachments, synced to Drive by the existing sync.

## Migrations (additive, generated with `prisma migrate diff --from-schema`)

1. `20261005090000_slice3_people` — `children.is_adult`.
2. `20261005100000_slice3_families` — table `families`, `children.family_id` (+ index, FK SET NULL).
3. `20261005110000_slice3_price_rules` — `events.price_rules`, `participants.price_category`, `participants.accepted_price_czk`.
4. `20261005120000_slice3_public_registration` — `events.public_registration/public_slug (unique)/landing_content`, `families.needs_review`, `participant_field_templates.required_in_registration`, table `portal_rate_hits`.
5. `20261005130000_slice3_auto_accept` — enum `AutoAccept`, `events.auto_accept` (default `manual`).
6. `20261005140000_slice3_portal_v2` — enum value `MailDocReceivedVia.portal`, `events.location/portal_info`, `participant_documents.received_by_user_id` DROP NOT NULL.

All new columns are nullable or defaulted; the unique index on `public_slug` is on an
all-NULL column. Safe to run before the new code is live.

## Seeds / env vars

- `npx tsx scripts/seed-registration-slice3-i18n.ts` (cs + en). Run it **after** the
  slice-2 seed: it updates a few slice-2 texts (`nav.children`/`children.title` →
  "Lidé", `portal.gateHint`, `portal.gateLabel`, `portal.noEvents`, `portal.tab.events`).
- No new env vars. `PORTAL_SECRET` (slice 2) is also the key for the IP hashes;
  `PORTAL_BASE_URL` is not used for `/r/<slug>` links (settings show the admin's origin).

Deploy = the slice-2 steps: migrations, `seed-registration-slice3-i18n.ts`, build + deploy.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`).
- `npx tsx scripts/test-registration-slice3.ts` — families (suggestions, contacts),
  family gate + cookie scoping, all five price examples + member price + retroactive
  household + school-year exclusion + no-rules = old pricing, public-form validation
  (guardians, required/select/date fields, oddíl, honeypot, max 10), auto-accept mode
  selection, upload type sniffing, portal card layout.
- Still passing: `test-membership.ts`, `test-registration-portal.ts`,
  `test-blank-pages.ts`, `src/lib/*.check.ts`.
- eslint on new/changed files: only the accepted `react-hooks/set-state-in-effect`
  pattern (plus pre-existing findings in untouched parts of changed pages).

## NOT tested (no DB, no browser here)

Every Prisma query and transaction, the migrations themselves, the public form and
portal UI in a browser, cookies across devices, Gmail sending (auto-send, re-send),
GCS upload/download, Drive sync of uploads, the rate limit under concurrency, and the
layout editor drag & drop.

## Manual test checklist (Pavel)

Before switching anything on:
- [ ] An existing camp: roster, detail, prices, VS/QR, acceptance e-mail — unchanged; no price-change flags.
- [ ] Menu shows "Lidé"; the list shows children; filter "Dospělí" / "Všichni" works.

People + families (A/B):
- [ ] Person detail → tick "Dospělý člen" → appears under "Dospělí".
- [ ] Two siblings with the same guardian e-mail → "Navržené rodiny" proposes them (+ an adult whose own e-mail is that guardian) → rename → "Vytvořit rodinu".
- [ ] Family card: contacts show the adult once ("Jana (jana@…)"); remove / add a member; merge two families; dissolve.
- [ ] Family "Kopírovat odkaz" → private window → any member's birth date passes; all members are shown; an old child link still shows just that child.
- [ ] "Nový odkaz" on the family → old family link 404, devices asked again.
- [ ] "Poslat" on a family → compose shows all members' guardians once → send → each member's detail lists the send.

Prices (C):
- [ ] Membership event → Ceny → "Pravidla" → "Členství (výchozí)" → pick the Oddíl field → preview: 1300 / 1100 (2) / 650 (from 1. 9.) and 500 / 400.
- [ ] Two siblings registered as oddíl: both 1100 in the roster; register the second one later → the first one's price drops too; if the first had its acceptance e-mail already → "cena se změnila po odeslání: 1300 → 1100 Kč".
- [ ] Participant detail: change the category → price changes; VS unchanged.
- [ ] Switch back to "Jednoduše" → member / non-member prices as before.

Public page + review (D):
- [ ] Šablony → Účastníci: a field visible in the portal → "povinné ve veřejné přihlášce".
- [ ] Membership event → "Veřejná přihláška": on, slug, landing text (markdown) → open `/r/<slug>` logged out.
- [ ] Adult + 2 children, "Stejné údaje jako osoba 1", category per person, oddíl → live total incl. household discount → Odeslat → thank-you screen; nothing e-mailed.
- [ ] Lidé → "Ke kontrole": the new family; a person matching an existing one by name+birth date / guardian e-mail is listed → "sloučit" → registration moves to the existing person; "Zkontrolováno" clears it.
- [ ] 6 valid submits within an hour from one device → the 6th says too many.

Auto-accept (E):
- [ ] "Přijmout automaticky, nic neposílat" → a portal registration is "Přijato" at once, no e-mail.
- [ ] "Přijmout a hned poslat…" (warning shown) with the event's mailbox connected → registration accepted, documents generated, acceptance e-mail arrives, logged on the participant.
- [ ] Same without a connected mailbox → red warning in settings; registrations only accepted.
- [ ] Import / manual add in that event → still pending.

Portal v2 (F):
- [ ] Desktop: profile/family left, registrations right; phone: one column.
- [ ] Nastavení → "Karta přihlášky v portálu": hide "Platba", add an own section with 2 fields, reorder → portal card follows.
- [ ] Document types: tick "Rodiče ho mohou nahrát v portálu" on one → portal shows "chybí" + upload → upload a PDF → "přijato od vás", admin detail shows it "z portálu"; a .txt renamed to .pdf is refused.
- [ ] Accepted registration with the event mailbox connected → "Poslat znovu e-mailem" → e-mail arrives; 4th try the same day refused.
- [ ] Membership year open in the portal, family with last year's membership → "Obnovit členství" with all members ticked, categories, total → confirm.
