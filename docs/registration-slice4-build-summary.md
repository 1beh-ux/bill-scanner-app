# Registration & membership — slice 4 (feedback round 1): build summary, 2026-10-05

Spec: `docs/registration-slice4-spec.md`. Earlier: `docs/registration-slice3-spec.md`,
`docs/registration-slice3-build-summary.md`. Branch `registration-slice4` (from
`registration-slice3`). Not merged, not deployed.

## Opt-in guarantee (still holds)

With no new setting touched the app behaves as before, with these deliberate
exceptions that only touch slice-2/3 features:

- **Portal uploads now wait for review** (spec 6). An upload no longer counts as
  received until an admin approves it. Rows from before this slice have
  `reviewStatus = null` and count exactly as before; e-mail / manual / sheet /
  generated rows are untouched.
- `Event.paymentDocTypeId` null (default) → no "Zaplaceno / Čeká na platbu" line;
  the payment block appears exactly as before.
- The portal gets the member/status filters, folded event text and the new upload
  button; the event roster gets a status filter (all = default); field settings
  get the "Rodiče v portálu" column (same data as the old small select).
- `{{portal_link}}` / `{{portal_link_line}}` are empty for events that aren't
  connected / a membership year, and for participants not linked to a person.
  Templates that don't use them are unaffected.
- E-mail: nothing new is sent automatically. The public form shows a link only for
  `accept_send` events (the send itself is the slice-3 path). The yearly invitation
  is the existing compose page (preview + confirm). Upload review sends nothing.

## What was built

| Spec | Where |
|---|---|
| 1. member filter | `PortalApp.tsx`: chips "Všichni" + one per member; a member chip picks the profile (left) and filters registrations + history (right); "Všichni" (default) shows all. |
| 2. upload button | Filled accent button with an upload icon (`lucide-react`), white on `ember` in both themes, focus ring; size/type hint below it. |
| 3. status filter | `src/lib/registration-status.ts` `registrationState()` (pure). Portal chips "Chybí údaje nebo dokumenty / Čeká na potvrzení / Vše hotovo / Vše" with counts. State computed per card in `portal-server.ts` (`registrationCard`). |
| 4. event text | `EventInfo` in `PortalApp.tsx`: `line-clamp-3` + "Zobrazit více / méně" when the text is long (> 220 chars or > 3 lines). |
| 5. payment | `Event.paymentDocTypeId`, picked in Nastavení akce → Registrace a členství (`PortalSettings.tsx`, "Dokument platby"). Portal: payment block shows "Zaplaceno" / "Čeká na platbu" + the delay note; that type is left out of the card's documents and refused by `/api/portal/<token>/upload`. |
| 6. review model | `ParticipantDocument.reviewStatus` (`pending | approved | rejected`, nullable), `reviewNote`, `reviewedByUserId`, `reviewedAt`. Upload creates `pending`. `RECEIVED_WHERE` / `countsAsReceived` used by: roster "Dokumenty" counts, `getReceivedItemIds` (Mail status e-mails, Documents overview, sheet export, Pošta reply checklist), participant documents API, manual toggle, table-sync tick, Drive sync (`NOT_IN_REVIEW`: pending/rejected files are not mirrored). |
| 7. review UI | API `GET/POST /api/events/<id>/documents/<docId>` (file inline/download; approve / reject with reason) and `GET /api/events/<id>/documents/review` (list, `?count=1`). Participant detail → documents: pending/rejected uploads per type with Zobrazit / Stáhnout / Schválit / Zamítnout. Page `/events/<id>/participants/review` "Nahrané dokumenty ke kontrole (N)", linked (when N > 0) from the roster toolbar and the Pošta header (`UploadReview.tsx`). |
| 8. roster filter | `/api/events/<id>/participants` returns `state` (same function); select with counts on the roster. |
| 9. field settings | `ParticipantFieldAdmin.tsx`: column "Rodiče v portálu" (select + "povinné při registraci"). Event scope: fields with an org template edit that template (hint above the table), event-only ones say "jen pro tuto akci — v portálu nelze", non-admins see it read-only. Lidé intro links "Co vidí a upravují rodiče →" to `/templates?tab=participants`. |
| 10. confirmation | Public form on an `accept_send` event: the new family gets a portal token, the API returns the link, the thank-you screen shows it with "Uložte si…", copy button and the birth-date note; otherwise the new "Přihlášku jsme přijali…" text, no link. Portal registration: only a status line (pending / accepted / accepted + sent) — `autoAcceptRegistrations` now returns the outcome. |
| 11. variables | `portalLinkVars()` in `document-variables.ts`, resolved in `resolveVariables` for documents and e-mails; base `PORTAL_BASE_URL` else `APP_BASE_URL` (`portalBaseUrl()` in `portal-gate.ts`). Listed in the e-mail variable pickers (all participant purposes) and the document template preview; known to the template check. |
| 12. yearly invitation | Lidé: filters membership year / event attended / has-no portal link / in-without family; header checkbox selects the filtered list; "Poslat odkaz (N lidí → M e-mailů)" maps family members to `family:<id>` (one e-mail per family). Compose page: template select "Odkaz do portálu" / "Pozvánka do portálu / nový rok" (`portal_invitation`, editable in Šablony → Zdraví → E-mail). |

## Assumptions (spec silent → simplest option)

1. **An upload in review is "waiting", not "missing"** for its document type —
   the parent did their part. (Spec: missing = "nothing received/approved", waiting
   = "an upload awaits review"; taken literally a pending upload would never reach
   "waiting".) A rejected upload with nothing else received = missing.
2. A pending re-upload on a type that's already received still makes the
   registration "waiting".
3. **Required fields**: org templates with `requiredInRegistration`, active, visible
   in the portal. Checked on the linked person's profile; for participants without a
   person (unconnected events) only against the fields the event has, from the
   participant's own values — otherwise every unconnected camp would show "missing".
4. Payment: "missing" only for an accepted registration whose payment type isn't
   received; a pending registration doesn't ask for it. The payment document type is
   still counted in the roster's "Dokumenty x/y" (it is a tracked type there). In the
   portal the payment block now also appears for an accepted registration without a
   variable symbol yet (accept without send) when a payment type is set — price and
   paid status only, bank details still only after the acceptance e-mail.
5. Approve sets `receivedByUserId` = reviewer (spec) and also `reviewedBy/At`.
   Reject keeps the file (admin can still open it); the parent may upload again.
   Unticking a document by hand doesn't delete uploads that are in review / rejected.
   Ticking by hand while an upload waits adds a manual row; the upload stays in review.
6. `{{portal_link}}` token creation: **a real send whose subject/body contains
   `{{portal_link…}}`**, or document generation on the acceptance send (the Google
   Doc's text isn't known beforehand, so a link is created for every generated
   document of a linked participant in a connected event). Previews never create one —
   they show `…/p/…` when there's no link yet. The Pošta reply builder creates one
   when its template uses it.
7. Portal registration status text: pending = "Přihlášku jsme přijali. Po potvrzení
   vám pošleme e-mail s dalšími informacemi." (the parent already has the link);
   accepted / accepted + sent get their own line.
8. Public form link: shown whenever the event is set to `accept_send`, even if the
   send then falls back to plain accept (no mailbox) — the link works either way.
9. Lidé "má odkaz": a family member has a link when the **family** has one; others
   their own. "byl členem v roce X" = an accepted registration in that membership year;
   "účastnil se akce" = any registration in that event.
10. Event-scope "Rodiče v portálu" matches an event field to a template by key
    (active templates only), not by the `isFromTemplate` flag.
11. The admin file endpoint sends `Content-Security-Policy: sandbox` so a parent's file
    opened inline can't run as the app's origin.

## Migrations (additive, `prisma migrate diff --from-schema`)

1. `20261006090000_slice4_upload_review` — enum `DocReviewStatus`;
   `participant_documents.review_status/review_note/reviewed_at/reviewed_by_user_id`
   (+ FK to users, ON DELETE SET NULL); `events.payment_doc_type_id`.

All new columns nullable. Existing rows get `review_status = NULL` = counted as today.

## Seeds / env vars

- `npx tsx scripts/seed-registration-slice4-i18n.ts` (cs + en). Run **after** the
  slice-3 seed: it overwrites `portal.upload`, `portal.uploadDone`, `public.doneHint`,
  `portalAccess.*`, `publicSettings.requiredInRegistration`.
- No new env vars. `APP_BASE_URL` (already on Cloud Run) is the fallback base for
  `{{portal_link}}`; `PORTAL_BASE_URL` wins when set. Neither set → the variables are empty.

Deploy = migration, the seed, build + deploy (same as slice 3).

**Action for the admin after deploy:** the org default acceptance template
(Šablony → Zdraví → E-mail → přijetí přihlášky) is *not* changed automatically — add
`{{portal_link_line}}` where the parent should get the portal link (and check events
that override the template). The public form now promises "Po potvrzení vám pošleme
e-mail … a odkazem do portálu", which is only true once that variable is in the template.

## Checks run here

- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` — pass (dummy
  `DATABASE_URL` / `NEXT_PUBLIC_FIREBASE_*`). (`.next` was deleted once to free disk
  space for the build.)
- `npx tsx scripts/test-registration-slice4.ts` — review counting (incl. the Prisma
  filter), doc state precedence, registration state incl. payment, rejected and
  pending uploads, required fields, `{{portal_link_line}}` text and emptiness for
  unconnected / unlinked / no-base-URL.
- Still passing: `test-blank-pages.ts`, `test-membership.ts`,
  `test-registration-portal.ts`, `test-registration-slice3.ts`, `src/lib/*.check.ts`.
- eslint on new files clean; changed files only show the accepted
  `react-hooks/set-state-in-effect` pattern and pre-existing findings.

## NOT tested (no DB, no browser here)

All Prisma queries and the migration itself, the review endpoints and GCS
download, the portal / roster / Lidé / compose UI in a browser (filters, chips,
upload button in light + dark), token creation on send, the public form's link
display, the Drive sync skipping uploads in review.

## Manual test checklist (Pavel)

Before switching anything on:
- [ ] Existing camp: roster counts, Documents overview, status e-mail checklist, sheet export — unchanged. Status filter "Vše" shows everyone.
- [ ] Acceptance e-mail of a connected event without `{{portal_link…}}` in the template — unchanged, no link created (Lidé "nemá odkaz" still lists the child, unless documents were generated — see assumption 6).

Uploads (6–7):
- [ ] Portal: upload a PDF → "nahráno, čeká na kontrolu"; roster "Dokumenty" count unchanged; status e-mail preview shows it missing.
- [ ] Roster / Pošta show "Nahrané dokumenty ke kontrole (1)" → list → Zobrazit (opens in a tab), Stáhnout.
- [ ] Zamítnout without a reason is disabled; with "nečitelné" → portal "Zamítnuto: nečitelné — nahrajte prosím nový." → upload again → back in the list.
- [ ] Schválit on the participant detail → counted as received, "z portálu"; Drive sync copies it afterwards.

Portal (1–5):
- [ ] Family link: "Všichni" shows all registrations; a member chip shows only theirs (and their profile).
- [ ] Status chips with counts; a registration with a missing document under "Chybí…", a pending one under "Čeká…".
- [ ] Long event info folded to 3 lines, "Zobrazit více / méně".
- [ ] Upload button clearly visible in light and dark mode.
- [ ] Event → "Dokument platby" = e.g. "Platba" → accepted registration shows "Čeká na platbu" + note; tick the document (or sheet sync) → "Zaplaceno"; the type isn't in the card's documents nor uploadable.

Roster filter (8):
- [ ] Event roster → status select with counts; works on an unconnected camp (pending = waiting).

Field settings (9):
- [ ] Šablony → Účastníci: "Rodiče v portálu" column; change a level → portal follows.
- [ ] Event → participant fields: a template field shows the same select (hint says it edits the template); an event-only field shows "jen pro tuto akci — v portálu nelze".
- [ ] Lidé → "Co vidí a upravují rodiče →" opens Šablony on the Účastníci tab.

Links (10–11):
- [ ] Public form on a `manual` event → "Přihlášku jsme přijali. Po potvrzení…", no link.
- [ ] Public form on an `accept_send` event → link + copy + birth-date note; the link opens the family portal.
- [ ] Portal registration → status line only.
- [ ] Add `{{portal_link_line}}` to the acceptance template → accept a connected participant → e-mail has the sentence with the family link; the same template in an unconnected camp → the line is gone.

Yearly invitation (12):
- [ ] Lidé: filter "byl členem v roce 2026" + "nemá odkaz" → select all → "Poslat odkaz (N lidí → M e-mailů)" → compose lists families once.
- [ ] Switch the template to "Pozvánka do portálu / nový rok" → preview → Odeslat → confirm → one e-mail per family.
