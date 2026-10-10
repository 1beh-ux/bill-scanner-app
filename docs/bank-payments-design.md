# Claude Code prompt 12: automatic payment confirmation from a Fio bank account

Self-contained spec (decisions final, from Pavel's design doc "Fio payment check — design draft v1").
First save this whole prompt as docs/bank-payments-design.md (commit), so it lives in the repo.

Repo: bill-scanner-app, branch `bank-check` from master. Read CLAUDE.md, AGENTS.md,
docs/organizations-change-notes.md, src/lib/org-scope.ts, src/lib/mail-token-crypto.ts,
src/lib/document-variables.ts (buildVariableSymbol, isMember), src/lib/registration-status.ts,
src/lib/portal-server.ts, src/components/events/PortalSettings.tsx, the acceptance-send code that sets
acceptedPriceCzk, and the existing cron routes. Small steps; after each: `npx prisma generate` (schema),
`npx tsc --noEmit`, `npx eslint` on changed files, commit. Czech UI, every new key in a seed script.
Schema changes additive only.

## Goal
A participant's payment is confirmed automatically when the money arrives on the organization's Fio
account. It is one more source for the event's existing payment document (Event.paymentDocTypeId):
a settled payment creates a normal ParticipantDocument of that type with receivedVia = "bank" (no
file), so every list, counter and the portal work unchanged. Manual, sheet, e-mail and portal sources
keep working; whichever confirms first wins.

## ABSOLUTE RULES about the Fio token
- Never ask for, print, log or store the token in plain text anywhere (code, logs, test output,
  commits). Pavel enters it himself in the app. You never need it.
- The Fio URL contains the token: never log a request URL, never put it into an error, exception
  message or API response; disable fetch logging for these calls. Errors carry short codes only.
- No API ever returns tokenEncrypted or the token.

## Part 1 – Schema
- `BankAccount`: id, organizationId (FK, required), label, accountNumber, bankCode (must be "2010"),
  provider enum `fio`, tokenEncrypted (nullable), tokenSetAt, tokenSetByUserId, lastCheckedAt,
  lastSuccessAt, lastError (short code), active, createdAt.
  Unique (organizationId, accountNumber, bankCode).
- `BankMovement`: id, bankAccountId (FK), movementId (Fio column22, string), bookedAt (date),
  amount (Decimal), currency, variableSymbol (nullable, normalized: digits, no leading zeros),
  counterName, counterAccount, message, status enum `settled | review | ignored`, reason (nullable:
  underpaid, overpaid, no_match, ambiguous, duplicate, not_czk), participantId (nullable),
  participantDocumentId (nullable, unique), decidedByUserId (nullable), createdAt, updatedAt.
  Unique (bankAccountId, movementId).
- Event: `bankCheckEnabled Boolean @default(false)`, `bankAccountId String?` (FK).
- Participant: `acceptedVariableSymbol String?` — set wherever acceptedPriceCzk is set (acceptance
  send), from buildVariableSymbol at that moment.
- MailDocReceivedVia: add `bank`.
- Add BankAccount to the organization-owned tables in check-org-scope and the isolation test.

## Part 2 – Fio client + pure matching (src/lib/bank/)
- `fio-client.ts`: GET `https://fioapi.fio.cz/v1/rest/periods/{token}/{from}/{to}/transactions.json`
  (dates yyyy-mm-dd). NEVER use `last/`. Timeout 20 s. Map: 409 -> throttled; 401/403, or 500/422 with
  a token problem -> token_invalid; network error / other 5xx -> unreachable; unparseable ->
  bad_response. `accountStatement.transactionList.transaction` may be null. Each item has
  `columnN: {value, name, id}`; use column22 (movement id), column1 (amount, >0 incoming),
  column14 (currency), column5 (VS), column0 (date — parse defensively), column10 (counter name),
  column2 + column3 (counter account + bank), column16 (message).
- `bank-matching.ts`: PURE function, no DB: (movements, candidates) -> decisions. Rules:
  1. Incoming only; non-CZK -> review/not_czk.
  2. Candidates = accepted participants of events with bankCheckEnabled using this account, with a
     paymentDocTypeId, not yet paid; each has acceptedVariableSymbol, current VS, expected price
     (acceptedPriceCzk ?? live price, same function the portal uses).
  3. Normalize VS (digits only, strip leading zeros). Match on acceptedVariableSymbol OR current VS.
  4. Exactly one candidate: amount >= expected -> settle; amount < expected -> review/underpaid;
     amount > 2 × expected -> review/overpaid.
  5. No candidate (incl. no VS) -> review/no_match. Two or more -> review/ambiguous (never guess).
  6. Candidate already paid -> review/duplicate.
- `scripts/check-bank-matching.ts`: fake Fio JSON in, expected decisions out: null list, outgoing,
  EUR, no VS, exact, leading zeros, old VS (accepted) vs new VS, overpaid > 2×, underpaid, two
  candidates, already paid, the same movement twice. Prints pass/fail; must all pass.

## Part 3 – checkBankAccount(bankAccountId, { reason }) (src/lib/bank/check.ts)
1. No event using the account has an unpaid accepted participant -> return { status: "nothing_to_do" }
   without calling Fio.
2. Atomic claim: `UPDATE bank_accounts SET last_checked_at = now() WHERE id = $1 AND (last_checked_at
   IS NULL OR last_checked_at < now() - interval '35 seconds') RETURNING id`; not claimed ->
   { status: "throttled" }.
3. Decrypt the token (new src/lib/bank/token-crypto.ts, same AES-256-GCM pattern as
   mail-token-crypto.ts but env BANK_TOKEN_ENC_KEY). from = oldest acceptance date of unpaid
   candidates minus 1 day, not earlier than today − 85 days; to = today (Europe/Prague).
4. Insert unseen movements (skip existing movementIds), run the pure matcher on the new ones,
   apply decisions. Settle = ONE transaction: create ParticipantDocument (participantId,
   eventListItemId = event.paymentDocTypeId, receivedVia "bank", receivedByUserId null) + set the
   movement settled with participant/document ids. Skip if the participant got paid meanwhile
   (-> review/duplicate).
5. Store lastSuccessAt or lastError (code). Return { status: "ok", settled, review } or
   { status: "error", code }.
- If an admin deletes a ParticipantDocument that came from the bank, set its movement to `ignored`
  (reason kept) so it is never re-used automatically.

## Part 4 – Routes (all through the org-scope guards)
- Organization admin (isOrgAdmin, own organization): `GET/POST /api/bank-accounts`,
  `PATCH/DELETE /api/bank-accounts/[id]` (DELETE = disconnect: clears tokenEncrypted, switches
  bankCheckEnabled off on every event using it; `?withMovements=1` also deletes its movements),
  `PUT /api/bank-accounts/[id]/token` (validate /^[A-Za-z0-9]{64}$/, encrypt, save tokenSetAt/By,
  then one test call; respond with status only), `POST /api/bank-accounts/[id]/check`.
- Event (requireEventInOrg + module access as for the roster): `POST /api/events/[id]/bank-check`
  (runs checkBankAccount for the event's account, returns the summary), `GET
  /api/events/[id]/bank-movements` (movements linked to this event's participants + review movements
  of its account), `POST /api/events/[id]/bank-movements/[movementId]/assign` {participantId}
  (creates the payment document with receivedVia "bank", movement -> settled, decidedByUserId) and
  `/ignore`.
- Event settings save: bankCheckEnabled may be true only if paymentDocTypeId is set and the chosen
  account belongs to the event's organization and its number/bank code equals the event's
  registrationBankAccountNumber/registrationBankCode (clear Czech error otherwise).
- Portal: `POST /api/portal/[token]/bank-check` — same gate and rate limiting as other portal calls;
  runs checkBankAccount for that participant's event account and returns ONLY { paid: boolean,
  paidAt?, via? } for the participant(s) of this family token. Nothing else.
- Cron: `/api/cron/bank-check` (CRON_SECRET, same pattern as the other crons): every active account
  with a token and at least one enabled event; log a one-line summary per account (no token, no URL).

## Part 5 – Screens (Czech)
- Organizace -> Připojení -> new section "Banka" (organization admin): list (label, account/2010,
  status line "Naposledy OK: …" / "Problém: <readable text for the code>", token expiry = tokenSetAt +
  180 days with an amber warning 14 days before). "Připojit Fio účet": label, account number
  (bank code fixed 2010), write-only password-type token field. Help text: "Token vytvořte v Fio
  internetovém bankovnictví: Nastavení -> API -> Přidat token, typ „Pouze sledovat účet“ (nemůže
  odesílat peníze). Platí 180 dní, použitelný asi 5 minut po vytvoření. Token sem vložíte jen jednou;
  aplikace ho už nikdy nezobrazí." Buttons "Vyměnit token", "Zkontrolovat nyní", "Odpojit" (shared
  ConfirmDialog, option "Smazat i uložené platby").
- Nastavení akce, next to "Dokument platby" (PortalSettings): switch "Automaticky ověřovat platby z
  banky" + account select (only matching accounts; hint if none: "Účet pro platby akce není
  připojený Fio účet – připojte ho v Organizace -> Připojení -> Banka"). Shown only when a Dokument
  platby is selected.
- Roster and Pošta -> Dokumenty: when the event has the check on, auto-run the event bank-check once
  on page open, plus a button "Zkontrolovat platby" with a result message (Potvrzeno N plateb /
  Nic nového / Kontrola proběhla před chvílí, zkuste za 30 s / Problém: …). Payment cell for
  receivedVia bank: "Doručeno · banka", tooltip date + amount.
- New event page "Platby z banky" (under Účastníci or Pošta, only when the check is on): tabs
  "K vyřešení" (review, with reason in Czech, VS, amount, date, name, message; actions "Přiřadit
  účastníkovi" with a participant picker, "Ignorovat") and "Spárované" (settled, ignored).
- Portal payment card (unpaid, check on): keep QR/account/VS/amount; add "Zkontrolovat platbu" and
  the note "Platbu ověřujeme automaticky z banky, obvykle do minuty od připsání na účet." Call the
  portal bank-check on card open and every 10 s for 2 minutes after the QR is shown (stop when paid
  or the page is hidden). Paid via bank: "Platba přijata ✓ (potvrzeno z banky, <date>)".

## Part 6 – Config, verification, deploy
1. cloudbuild.yaml: add `BANK_TOKEN_ENC_KEY=bank-token-enc-key:latest` to --update-secrets (the
   secret already exists; do NOT create or read it).
2. Verification: tsc, eslint, `npm run build`, check-bank-matching (all pass), check-org-scope
   (0 unexplained; add a rule that fails if any file under src/lib/bank or the bank routes logs a
   URL/token: grep for console.* with url/token/fioapi), test-org-isolation --run (extended: other
   organization can't list/use/check Záře's bank accounts or movements -> 404/403; portal bank-check
   returns only paid flags). Throttle test: two checkBankAccount calls within 35 s on a test account
   without a token -> second returns throttled. Any fail -> STOP.
3. Push `bank-check`, fast-forward master, push. Note the serving revision. Deploy with the full
   ~/deploy-registration.sh flow (no --async). Broken -> roll back, report.
4. Cloud Scheduler: create job `bank-check` mirroring the existing exchange-rates job (`gcloud scheduler
   jobs describe` it: same location, header, auth style), URI https://tabornik.online/api/cron/bank-check,
   schedule "*/30 * * * *", time zone Europe/Prague. Run it once manually and report the response
   (expect nothing_to_do / no accounts yet).
5. Checks: tabornik.online/login 200; Organizace -> Připojení page renders (list what Pavel must click).
6. Summary: files, migration, check results, anything contradicting this prompt. Append a short section
   to docs/organizations-change-notes.md (new org-owned table) and keep docs/bank-payments-design.md.
