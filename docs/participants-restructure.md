# Participants restructure + bug fixes (2026-09-10)

## Bug fixes

- **Payments page showing 0 Kč / missing bills**: `unpaid-summary` and
  `paid-summary` only counted a bill's CZK total when `Bill.amountCzk` was
  set. Newer bills always have it set (approval blocks otherwise), but older
  bills approved before that check existed can still have it `null` even
  though `totalAmount` (in CZK, since `currency` is CZK) is fine. Added
  `effectiveAmountCzk()` (`src/lib/bill-amount.ts`) as a shared fallback:
  null CZK amount + CZK currency -> use `totalAmount`. A genuinely
  unconvertible foreign-currency bill still shows as excluded, same as
  `budget-summary` already did.
- **QR code not generating**: was fully downstream of the bug above -- the
  payments page skips QR generation when the computed amount is `<= 0`.
  `czechAccountToIban` itself was already correct (verified against
  239740801/3030). The QR panel now also distinguishes *why* no code is
  shown (missing bank details / invalid bank details / zero amount) instead
  of one generic message.
- **Bills page not centered**: the bills table had no local
  `overflow-x-auto` wrapper (every other table page does), so a table wider
  than the viewport widened the whole scrollable area and threw off
  `mx-auto` centering. Wrapped it to match. The small residual
  sidebar-width centering offset is systemic (`providers.tsx` centers
  within `<main>`, which is narrower than the viewport by the sidebar) and
  affects every page equally -- left as is since it's consistent app-wide,
  not worth the wider blast radius of changing shared layout.

## Page widths

Standardized on existing Tailwind width tokens instead of ad hoc values:
narrow/settings pages stay `max-w-2xl`, single-record detail pages
`max-w-3xl`, list/table pages `max-w-5xl` (bumped from `max-w-3xl`/`max-w-4xl`:
Health, Payments, Authors, Exchange rates, Events, Budget, Users, event
detail, send-summaries), dense multi-column tools stay wide
(`max-w-6xl`/`1400px`: Meds grid, Mail Helper).

## Seznam účastníků (participant list restructure)

Split the single Health participants page into three:

- **`/events/[id]/participants`** (new, top-level nav item gated on
  `health OR mail` access) -- the master roster: add/import/edit
  core fields (name, group, DOB, guardians), accept registrations, bulk
  email, delete. Reuses `ComposeEmailModal` and `BulkStatusModal` unchanged.
- **`/events/[id]/health`** (existing route, slimmed) -- group/age/
  documents/name only, plus incident logging. No more registration column,
  no more add-participant form -- both moved to the central page. Health's
  own participant detail page keeps its edit button, but it now only edits
  health-specific notes (allergies/meds/chronic/other); a separate "Upravit
  údaje" link jumps to the central page's core-fields edit (deep-linked via
  `?edit=<id>`).
- **`/events/[id]/mail/participants`** (new) -- name/age/acceptance status
  plus one column per active document type, each a click-to-toggle manual
  received/missing marker (new `POST`/`DELETE
  /api/events/[id]/participants/[participantId]/documents/[docTypeId]`,
  `receivedVia: "manual"` on the same `ParticipantDocument` row the email
  flow uses).

**Why split core vs. health fields**: `/api/participants/[id]` (name,
guardians, allergies, meds notes, etc.) stays gated to `health` only -- the
existing mail-participants route already documented that a mail-only grant
must never see health fields. Central-page editing needed to work for
mail-only admins too, so it goes through a new lean
`/api/participants/[id]/core` (name/group/DOB/registrationStatus only,
gated `health OR mail`) instead of widening the existing route's exposure.

**Persisted Sheet connection**: `Event.participantsSheetId` +
`Event.participantsColumnMapping` (new columns, `Json` mapping keyed by
*header name* so a reordered sheet still matches). The import page
(moved from `/events/[id]/health/participants/import` to
`/events/[id]/participants/import`) loads the saved connection
automatically on open and offers a "Zapamatovat toto propojení" button to
save the current sheet id + column mapping.

## Schema changes (needs a migration)

```prisma
participantsSheetId       String? @map("participants_sheet_id")
participantsColumnMapping Json?   @map("participants_column_mapping")
```

Bundled with the still-pending `registrationStatus` field from the
registration-workflow batch -- both go through the same
`prisma migrate dev` run (see that doc's "Open" section for why this needs
Cloud Shell, not the laptop, in this org's setup).
