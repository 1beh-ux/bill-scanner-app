# Veřejná akce (public event with ticket sales) — decisions, 2026-10-19

Example: a dancing ball. Status: **built 2026-10-19** (see "Where it lives" at the end).

## What it is

- A new **event type "Veřejná akce"**, chosen when the event is created. Its settings show only the
  ticket setup (prices, limits, e-mails, ticket template, public page). Camp registration parts are
  hidden. Bills / Bank stay available.
- Reuses the existing price setup (one or more price types, e.g. "vstupné", "student").
- Creates **no participants, people, families or children.** An order is a buyer plus some tickets.

## Order

- The buyer fills in their **name, e-mail and phone**, plus **how many tickets of each price type**.
  The tickets themselves have no names: each one shows the buyer's name and "vstupenka 2/4".
- **Limit per price type** (e.g. 250 normal + 50 student), plus an optional total. The form shows how
  many are left, or "vyprodáno".
- A **maximum number of tickets per order**, set per event.
- Public page + embed on another domain (same mechanism as the registration `/r/<slug>` + embed).
- **Parent portal:** shown to adults only, with name and e-mail prefilled. The order is not tied to
  the person.

## Payment and e-mails

1. On order: an automatic e-mail with payment details and a **payment QR (QR Platba)** containing
   the account, amount and variable symbol.
2. Payment is matched by the variable symbol (Fio API: within minutes).
   → An automatic e-mail with **one PDF, one page per ticket**, each page with its own check-in QR.
3. Unpaid orders stay until an **admin cancels** them (no automatic expiry).
4. Cancelling an order makes its tickets invalid (a scan shows them as cancelled), puts the tickets
   back on sale, and e-mails the buyer (editable template). Any refund is done by hand in the bank.

## Ticket

- **Fully editable template** (like the e-mail templates), with variables such as `{{ticket_qr}}`,
  `{{buyer_name}}`, `{{ticket_no}}`, `{{price_type}}`, `{{event_name}}`, `{{event_date}}`,
  `{{event_place}}`, and the organization's logo / colours.
- The QR holds a unique random ticket code (not guessable, not the order id).

## Check-in at the door

- A scan page using the phone camera, plus typing the code in by hand. It shows **valid** (and marks
  the ticket used), **already used** (with the time), or **unknown / cancelled**.
- Access, both ways:
  - a new event module **"Vstupenky"** (Event settings → Lidé) for people with a login;
  - an optional **secret scan link** for one-off helpers, which can be revoked.

## Where it lives (build 2026-10-19)

- Schema: `EventKind.public_event`, `ModuleKey.tickets`, `TicketOrder`, `Ticket`, `Event.ticketSettings` /
  `ticketScanToken`, `BankMovement.ticketOrderId` (migration `20261026090000_public_event_tickets`, additive).
- Rules (pure, self-check `src/lib/tickets.check.ts`): `src/lib/tickets.ts`. Price types = `Event.priceRules`
  categories with `capacity` (`src/lib/price-rules.ts`).
- Server: `src/lib/tickets-server.ts` (order under a per-event row lock, the three e-mails, paid, cancel, scan),
  `src/lib/tickets-pdf.ts` (markdown template -> one A4 page per ticket via the PDF service). Bank check:
  orders ride along as matcher candidates `order:<id>` in `src/lib/bank/check.ts`.
- Templates: e-mail purposes `ticket_order`, `ticket_send`, `ticket_cancel`, and `ticket_document` (the ticket page),
  edited in Nastavení akce -> Vstupenky (`src/components/tickets/TicketSettings.tsx`).
- Buyer: `/r/<slug>` shows `TicketForm` for public events (`/api/public/r/<slug>/tickets`), payment status
  `/api/public/tickets/<publicToken>`; portal `/api/portal/<token>/tickets` (adults, prefilled, not linked).
- Admin: `/events/<id>/tickets` (orders, CSV export, PDF, paid / resend / cancel), `/events/<id>/tickets/scan`;
  no-login door link `/vstup/<token>` (`/api/public/scan/<token>`). QR reading: `jsqr`.
- 2026-10-20: optional Google Doc ticket template (`ticketSettings.docTemplate`; one merged copy per ticket via
  `mergeAndExportDocument`, joined with pdf-lib); a public event also offers Plánování; the Vstupenky module
  can set the sender mailbox (Připojení na Google).
