# Registration & membership — slice 4 spec (feedback round 1), 2026-10-05

Slices 1–3 are live in production. Read `docs/registration-slice3-spec.md` and
`docs/registration-slice3-build-summary.md` first. Same hard rules as slice 3 (opt-in,
default off; no e-mail to a parent unless the event is explicitly `accept_send` or a
person clicks send/confirm; additive migrations via `prisma migrate diff`; no
production/gcloud; reuse existing code; Czech strings via a seed script). Decisions below
are Pavel's (2026-10-05).

## Portal (family / parent)

1. **Member filter applies to "Moje přihlášky".** Selecting a family member filters the
   registrations column to that member (and "Všichni" shows all). Today it always shows all.
2. **Upload button clearly visible** on the beige card background: a distinct button
   (filled/outlined with the app's accent colour, icon, enough contrast in light + dark).
3. **Status filter for registrations** (tabs or chips): "Chybí údaje nebo dokumenty",
   "Čeká na potvrzení", "Vše hotovo", "Vše". Definitions (one shared pure function, also
   used by the admin filter below):
   - *missing* = a required-in-registration field of the person is empty, OR an active
     document type has nothing received/approved (generated ones don't count as received),
     OR an upload was rejected, OR the payment document (see 5) isn't received for an
     accepted registration;
   - *waiting* = registration pending, OR an upload awaits review, OR the person has a
     pending profile change; and nothing missing;
   - *complete* = accepted, nothing missing, nothing waiting.
4. **Collapsible event text** on each card: event info/description collapsed to ~3 lines
   with "Zobrazit více / méně".
5. **Payment status.** Event setting "Dokument platby" = one of the event's document types
   (default none). When set: an accepted registration's payment block shows "Zaplaceno"
   once that document type is received (by manual tick, sheet sync, anything), otherwise
   "Čeká na platbu" + the note "Platba se zde zobrazí s několikadenním zpožděním — není
   třeba se znepokojovat." That document type is not offered for upload and is excluded
   from the normal document list on the card (it's shown in the payment block instead).

## Uploads need admin review

6. Portal uploads are **pending review**: new `ParticipantDocument.reviewStatus`
   (`pending | approved | rejected`, nullable — null for everything not uploaded in the
   portal, meaning "as today") + `reviewNote` + reviewer/time. Pending/rejected uploads do
   NOT count as received anywhere (roster "Dokumenty" counts, document status, sheet export,
   Mail status e-mails). Approve = counts as received (reviewer recorded as receiving user).
   Reject = short reason required; the portal shows "Zamítnuto: <důvod>" and allows a new
   upload. No e-mail either way.
7. Where the admin reviews: participant detail (documents section: view/download, Schválit /
   Zamítnout) and one per-event list "Nahrané dokumenty ke kontrole (N)" reachable from the
   event's participants page / Pošta section, with the same actions and a preview/download.

## Admin participant list filter

8. In the event participant list: a status filter with the same three states as 3 (+ counts),
   computed with the same function. Works for any event (for unconnected events "waiting"
   just means pending registration / pending uploads).

## Field settings for parents — make it findable

9. The per-field portal setting exists only as a small select in Šablony → Účastníci.
   Make it obvious: a dedicated column "Rodiče v portálu" (select: skryté / jen vidí / mohou
   upravit / úprava ke schválení + "povinné při registraci") in that table, AND the same
   column in the event's participant-field settings for fields that come from a template
   (editing it there edits the org template — say so in a hint); event-only fields show
   "jen pro tuto akci — v portálu nelze". On the Lidé page add a short link "Co vidí a
   upravují rodiče →" to that table.

## Links on registration + portal link variable

10. After a portal or public registration, the confirmation screen:
    - event `accept_send`: shows the family/person portal link, with "Uložte si tento
      odkaz" + copy button + the note that opening it asks for the date of birth of one of
      the registered people;
    - otherwise: "Přihlášku jsme přijali. Po potvrzení vám pošleme e-mail s dalšími
      informacemi a odkazem do portálu." (no link shown).
    (For a portal registration the person already has the link — show only the status text.)
11. Template variables `{{portal_link}}` and `{{portal_link_line}}` (the whole sentence
    "Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: <link> (při prvním
    otevření se zeptá na datum narození)." — empty when the event isn't connected / a
    membership year) in document and e-mail templates. Resolved for the participant's
    family link, else the child link; a token is created on first use. Base URL:
    `PORTAL_BASE_URL`, else `APP_BASE_URL` (already set on Cloud Run). Listed in the
    template variable pickers/help. Do NOT change the existing org default acceptance
    template text automatically — tell the admin in the build summary to add the variable.

## Yearly invitation / onboarding existing people

12. On Lidé: filters (adult/child exists) + "byl členem v roce <year>", "účastnil se akce
    <event>", "má / nemá odkaz do portálu", "v rodině / bez rodiny", plus select-all of the
    filtered list. "Poslat odkaz" for the selection works on families where they exist
    (one e-mail per family, not per child) and on people otherwise, with the existing
    editable template + preview + confirm. Add a second org template purpose
    `portal_invitation` ("Pozvánka do portálu / nový rok") selectable on the compose page
    besides `portal_link`, default text explaining: what the portal is, the date-of-birth
    check, how to renew membership for the coming year, where to see past events.

## Deliverables

- Branch `registration-slice4` from `registration-slice3`. Logical commits, pushed after each
  numbered group. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx prisma generate`, `npx tsc --noEmit -p .`, `npx next build` pass; eslint on new files
  clean except the accepted `react-hooks/set-state-in-effect` pattern.
- Self-check `scripts/test-registration-slice4.ts` (status function incl. payment and
  rejected upload; upload review counting; portal_link_line empty for unconnected events);
  all existing `scripts/test-*.ts` still pass.
- `scripts/seed-registration-slice4-i18n.ts` (cs + en).
- `docs/registration-slice4-build-summary.md`: built, assumptions, migrations + seeds,
  untested parts, manual test checklist.
