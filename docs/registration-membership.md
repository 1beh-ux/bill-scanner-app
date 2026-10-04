# Registration & membership — slice 1 (membership), 2026-10-04

Concept + decisions: the "Registration & Membership Module (concept)" Claude doc.

## Opt-in guarantee

Nothing changes for an event unless an admin turns it on. `Event.registrationConnected`
defaults to false and `Event.kind` defaults to `event`. With both left alone:

- participants aren't linked to children on add/import,
- `isMember()` ignores `childId` (no `memberChildIds` is loaded), so pricing and
  the variable-symbol digit come only from the manual membership field, as before.

Not using the module at all = never touching the switch. `Participant.childId` may
still get filled by the Děti page's "link all" button; nothing reads it for an
unconnected event.

## Pieces

- `Child` (identity only: name, birth date) + `Participant.childId`.
- `src/lib/children.ts`: `linkChildren` (match by name without diacritics/case + birth
  date; no birth date = never auto-linked), `memberChildIds`/`withMembers`.
- Membership year = an event with `kind = membership` + `membershipYear`. It runs the
  normal participants / import / acceptance email / documents / QR flow.
- In a connected regular event: member = accepted, active participant of the
  membership event whose `membershipYear` = the event's start year, OR the manual
  field (never instead of it).
- Děti page (`/children`, admin): link all, merge duplicates, link the unlinked by hand.
- Event settings → Akce → "Registrace a členství" (admin): type, year, connected switch.
- Self-check: `npx tsx scripts/test-membership.ts`.

## Deliberately not in slice 1

Profile data (contacts/health), parent portal + token link, profile → event push,
eligibility, a link-status column in the event roster (the Děti page covers it).
