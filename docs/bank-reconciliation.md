# Banka — bank reconciliation (prompt 5)

The design doc `bill-scanner-v2-design-bank-reconciliation-2026-10-16.md` rev. 2 was not available when
this was built (not on the machine, not in Drive); this file records what was built from the prompt and
Pavel's answers. Align with the design doc when it arrives.

## Decisions (Pavel, 2026-10-16)
- **Extend the existing bank data.** One `BankAccount` per real account (the payment check's table, now
  with `sourceType` fio_api | sheet | file, Sheet settings, column mapping, sync result). One Fio token,
  one 30 s slot (`claimFioSlot` in src/lib/bank/check.ts) shared by the payment check and Banka. Fio is
  read with `periods/` only — never `last/` (its server-side bookmark would be shared).
- **Explicit grant only**, admins and super-admins included (`hasModuleAccess` skips the admin shortcut
  for `bank`; the access grid shows a checkbox for admins in that column).
- **No XLSX** for now (no new dependency): CSV / paste / Google Sheet cover the Czech banks.

## Rules
1. The app never pairs on its own: a `BankMatch` with `method = suggested` and no `confirmedAt` counts
   nowhere (Platba state shows only "Návrh"). Only src/lib/bank/pairing.ts sets `confirmedAt`.
2. Pairing by amount + date (card 0..+5 days, other −15..+30); merchant (MerchantAlias), VS / text only
   order candidates. Sure = exact CZK amount and the only candidate on both sides.
3. Access: `requireBank` on every /api/events/[id]/bank/** route; bill routes via `requireBillAccess`.
4. Transaction details never leave Banka: bills APIs return only the payment state; the bill detail's
   counterparty only with Banka; the manifest gets Platba, Datum platby, ID pohybu only.
5. No cash book: Přehled compares withdrawn cash with bills marked Hotově.

## Code map (src/lib/bank/)
- `parse.ts` + `fields.ts` — decoding (UTF-8 BOM / UTF-8 / CP1250 via TextDecoder), delimiter and header
  row detection, column recognition (the import pipeline's `guessMappingFor`), Czech dates / amounts,
  external ids (`fio:<ID pohybu>`, `id:<ref>`, else `h:` + sha256 with the occurrence index).
  Self-check `scripts/check-bank-parse.ts`.
- `fio-client.ts` — `parseFioTransactions` (all documented columns; original amount from Upřesnění;
  balances), 422 = `history_locked` (data > 90 days needs the unlock in Fio, valid 10 minutes).
- `classify.ts` — automatic classification of new rows only (own account → transfer, ATM → cash, fee,
  participant VS → income/fee, else expense / income). Self-check `scripts/check-bank-classify.ts`.
- `import.ts` — preview / commit for every source; Sheet / Fio rows that vanished → `sourceMissing`;
  nothing is ever deleted automatically. `sync.ts` — Fio / Sheet sync, daily step in cron/exchange-rates
  (Fio accounts of active events, last 85 days).
- `suggest.ts` — suggestions + reimbursement hint (counterparty = a payer's account or name).
  Self-check `scripts/check-bank-suggest.ts` (also the payment state).
- `pairing.ts` — pair (difference reason), confirm best / all sure, reject, unpair (+ undo Proplaceno
  the pairing set). Every action writes BillAuditLog (`bank_*` action types).
- `bill-from-tx.ts` — Vytvořit doklad / Doklad = bankovní výpis: bill without a file
  (`gcsObjectPath` null, `documentMissing` / `documentFromStatement`), paired and confirmed at once.
- `document.ts` — upload onto a placeholder (AI runs, pairing stays), Najít doklad (same amount ±7 days
  in other events, Drive import folder not imported yet, assign to a person), replace with a found bill.
- `payment-state.ts` — `getBillPaymentState` (Banka / Částečně / Hotově / Jiný účet / Návrh / Nespárováno;
  a confirmed pair wins over a hand-set channel, flagged as conflict).
- `tx-query.ts` — tabs, filters, totals and group subtotals in the database, run in series
  (`inSeries`): db-f1-micro has ~25 connections for all instances; a dozen parallel aggregates per page
  exhausted them.

## Screens
Sidebar section Banka (explicit grant): Přehled, Pohyby, Párování, Účty a import; bill detail Platba box
and the no-document panel; bill list Platba column (default with Banka), chips, bulk Hotově / Jiný účet.
Help: content/help/banka.md. Texts: scripts/seed-bank-i18n.ts.

## Verification
`scripts/test-bank.ts` (tsconfig.org-isolation.json) — throwaway organization, end to end: access 403s,
CP1250 CSV with the header on line 4, duplicates, classification + a manual change surviving a re-import,
sure / possible / PLN ±3 %, nothing confirmed before a person, confirm all sure, rejected never again,
reimbursement → Proplaceno and back, bill from a payment (no file, approvable), Platba for a bills-only
user without counterparty, totals / group subtotals / filters, Sheet re-sync (edited = new, deleted =
sourceMissing, paired kept). Not covered automatically: the Fio API itself (the token stays in the app;
tested by Pavel), uploading a real file onto a placeholder (AI + GCS).

## Deploy (Part A)
Migrations `20261020090000_bank_reconciliation` + `20261020090100_bank_module_row` (additive; bills'
`gcs_object_path` now nullable). Build 1 failed on a transient Google Fonts fetch in Cloud Build
(IBM Plex Sans), the retry succeeded -> `bill-scanner-app-00109-dbk` (rollback `00108-jw8`).
Checks: tsc, eslint (no new errors), build, all self-checks, check-org-scope 0 unexplained,
test-org-isolation 73/73, test-bank 28/28, embed-check.

## Phase 2 (prompt 5 part B) — open
Needs from Pavel: a GPC sample from his bank (+ CAMT.053 if available). Note for B3: `Author` has no
e-mail field today — reminders need one (or "Kopírovat text" only).
