# Fields Manager — findings (verified against the code)

Date: 2026-11-21. Branch: `master` at `9bfeee2`. Read-only: code reading plus three read-only production queries
(counts only). No personal data below; every example is invented.

**Inputs used:** the prototype (`fields-manager-design/prototype/fields-manager.logic.js`, read as source; the HTML
shares the same logic), all 21 screenshots (01, 03, 05–12, 14–19 and 21 viewed in full; 02, 04, 13 and 20 are variants of
screens already viewed), `export/fields-inventory.md` (generated 2026-11-13 from production).
**Production design document:** it is the prototype's **"What changes"** tab (`IMP_AFF`, `IMP_NOT` and the suggested
order in `fields-manager.logic.js`, view `vImpact`). Its claims are checked in §8. Where this file says "verified", I
read the code path named; "assumed" means I did not.

## 1. The four layers — confirmed

| Layer | Model / storage | Written by (verified) | Read by (verified) |
|---|---|---|---|
| Organization template | `ParticipantFieldTemplate` (`key`, `label`, `fieldType`, `options`, `adultOptions`, `defaultSurfaces`, `portalAccess`, `requiredInRegistration`, `audience`, `level`, `profileSection`, `portalSummary`, `memberListColumn`, `portalSortOrder`), unique `(organizationId, key)`; app-level rows have `organizationId = null` | Šablony → Účastníci (`ParticipantFieldAdmin.tsx`, `/api/participant-field-templates/[key]`) | `registration-fields.ts` (`templateRules`, `askedFields`), `portal-server.ts`, `public-registration-server.ts`, `event-create.ts`, `participant-field-sync.ts` |
| Event copy | `EventParticipantField` (`key`, `label`, `fieldType`, `options`, `surfaces[]`, `sortOrder`, `active`, `isFromTemplate`, `kind` custom/builtin/guardian/computed, `computedType`, `requiredOnRegistration`), unique `(eventId, key)` | `event-create.ts` `createEventWithDefaults`, `participant-field-sync.ts` `syncParticipantFieldsForEvent`, `participant-field-seed.ts` `seedFixedParticipantFields`, `event-duplicate.ts`, `/api/events/[id]/participant-fields/*` | every list, document, e-mail, import, health note |
| Profile ("Lidé") | `Child.fieldValues` (Json map key → string), `ChildGuardian` | `portal-server.ts` (`updateProfile`, approved `ChildChange`), `children.ts` `copyProfileFromLatest` (one-time fill from the latest registration) | portal, `adults.ts` / `adults-server.ts`, travel orders, `profileValues()` in portal and roster status |
| Registration | `Participant.customFieldValues` (Json map key → string), `ParticipantGuardian` | public form (`createPublicRegistration`), portal (`saveRegistrationDetails`, routed), import/sync (`participant-sync-run.ts` `applyPlan`), participant detail edit (`/api/participants/[id]`, `/core`), bulk field edit (`/api/events/[id]/field-values`), key rename (`participant-fields/[fieldId]` PATCH rewrites stored keys) | `document-variables.ts` `fieldTextValues` → documents, e-mails, roster, Documents list, health notes, mail module |

**Important, verified:** documents, e-mails and lists read **only the registration copy**
(`fieldTextValues(participant, …)` reads `participant.customFieldValues`). The profile is read by the portal, adults,
travel orders and the roster's "missing" status — not by documents. **Import never writes the profile** (`applyPlan`
writes `Participant` + `ParticipantGuardian` only).

## 2. File-by-file

### `src/lib/fixed-participant-fields.ts` — confirmed, 17 rows
`Name`, `participant_first_name`, `participant_last_name`, `datum_narozeni`, `skupina`, `registrace` (builtin);
`zast_jmeno`, `zak_zast_jmeno`, `vztah`, `zast_telefon` (guardian); `Email` (computed `contact_email`), `price`,
`var_symb`, `clenstvi_rok`, `cenova_kategorie`, `podrobne_udaje`, `picture` (computed). Seeded on every event by
`seedFixedParticipantFields` (not on public events). `zak_zast_jmeno` resolves to the same guardian name as
`zast_jmeno` — the **only alias-like mechanism in the app today**. Guardian fields read the *first* guardian with
`receivesCommunications`, else the first (`firstGuardian()` in `document-variables.ts`).

### `src/lib/participant-sync.ts` (pure planner) — confirmed
- `SyncSettings = { mapping: header → key | "__registrationNumber" | "ignore", matchBy, onNew: create|report, onMatch: fill|overwrite|skip, overrides, excluded }`.
- `ParticipantSync` adds `id, name, sheetId, tab, autoSync, everyHours, seenKeys, markDocumentId, ownerUserId, runningSince, lastSync`. Stored as JSON in `Event.participantSyncs` (`updateSyncs`/`loadSyncs`).
- `SYNC_INTERVALS = [1, 3, 6, 12, 24]` hours. The prototype offers 30 minutes too — **not supported today**.
- Guardians: several columns may map to the same guardian key; they pair **by position** ("the Nth e-mail column goes with the Nth name/phone/relationship column"). A guardian **without e-mail is dropped**. So multiple guardians per row already work, but only for the four fixed properties.
- `guessTarget` maps headers by label/key normalisation; "skupina/oddíl/group" → `skupina` (`GROUP_FIELD`).
- Calculated (`computed`, `composite`) fields are not writable targets (`isWritableField`). Matches decision 4.

### `src/lib/participant-sync-run.ts` — confirmed
`applyPlan` creates/updates `Participant` + `ParticipantGuardian` in a transaction; `runSavedSync`, `runDueSyncs`
(called by `/api/cron/participant-sync`, Cloud Scheduler hourly at :23), 10-minute run lock, issues
(`unmatched`, `seen_missing`, `error`) kept only in `lastSync` — **there is no persistent review queue**.
`markDocumentId` ticks a document as received for every matched row.

### `src/components/participants/SyncEditor.tsx` (592 lines) — confirmed
The current mapping UI (header → field dropdowns, preview table, run report). Used by
`src/app/events/[id]/participants/import/page.tsx`. No graphical mapping, no value-translation step, no "new field
from column", no per-person merge target.

### `src/lib/document-merge.ts` — confirmed
`files.copy` of the template → one `batchUpdate` of `replaceAllText` per key (`{{key}}`, `matchCase: true`) → images:
`findPlaceholderRange` + delete + `insertInlineImage` (signed GCS URL, `qrSizeMm`) → **leftover `{{…}}` blanked**
(logged, not an error) → PDF export. No aliases, no revision guard (it edits its own copy, so none is needed there).

### `src/lib/document-variables.ts` — confirmed, this is today's resolver
`resolveVariables(participant, event, surface, createPortalLink)` builds: event-level keys (`participant_name`,
`camp_name`, `date_range`, `sender_email`, `document_checklist`, `questionnaire_url`, `questionnaire_line`,
`registration_deadline`, `registration_deadline_line`, `portal_link`, `portal_link_line`, `details_link`,
`details_link_line`, `membership_offer_link`, `organization_name`, `health_notes`) + every active field on that
surface via `fieldTextValues()`. `fieldTextValues` handles builtin, guardian, custom (booleans → Ano/Ne), computed
(`effective_price`, `variable_symbol`, `contact_email`, `membership_status`, `price_category`, `details_status`) and
then **composite** fields (`composeValue(readComposite(options))` — parts + separator, or a free template).
`DEFAULT_MEMBERSHIP_FIELD_KEY = "clenstvi_zare"` is hard-coded.

### `src/lib/template-check.ts` — confirmed
Reads all tabs, headers, footers and table cells; joins text runs **per paragraph**, so a placeholder Google split
across runs is still found. Status per key: `ok` / `field_off` (exists, not on `documents`) / `unknown` / `invalid`;
reports `{{ key }}` with spaces (never replaced by the merge). **The event-key list is a second, hand-kept copy**
(`EVENT_KEYS`, 16 keys) — it must stay in sync with `resolveVariables` by hand. `applyTemplateKeys` turns on / creates
fields for unknown keys.

### `src/lib/registration-fields.ts` — confirmed
`askedFields()` = what a registration asks: event fields with `requiredOnRegistration`; template-backed ones only
while `portalAccess` is edit/approval and the audience fits. **`source: "profile"` means "has an organization
template", `source: "event"` means "event-only field"** — this is the real profile/event split today.
`routeAnswers()` already decides write targets for portal answers: registration always; profile when
`source = profile` and access `edit`; a `ChildChange` proposal when access `approval`.

### `src/lib/portal-server.ts` — confirmed (704 lines)
Profile editing per `portalAccess` (`updateProfile`, `proposeChange` → `ChildChange`, admin approves), `requiredEmpty`
from the template flag, `saveRegistrationDetails` (two-step events) uses `routeAnswers`.

### `src/lib/public-registration-server.ts` — confirmed
`publicEvent(slug)` requires `publicRegistration`, `status: active`, (`registrationConnected` or kind
membership/public_event), deadline not passed, and the registration module on. `createPublicRegistration` writes
registration + (by `peopleLinkMode`) the person.

## 3. Decisions A and B against the code

**A — "follow the field's level": does not fit as worded.** `level` (`basic`/`detailed`) decides *when* a field is
asked (two-step registration: basic at registration, detailed after acceptance — `isBasicAsk`, `askedLater`), not
*where* it is stored. Storage today follows **template vs event-only** (`AskedField.source`) plus `portalAccess`
for profile edits. Two concrete conflicts:
1. `velikost_trika` (t-shirt, your example of an event-level field) **is an organization template**, so today it
   is a profile field; `level = detailed`.
2. Health and upbringing questions are templates with `level = detailed` — under a literal "level" rule nothing
   would distinguish them from t-shirt size.

Closest alternative (proposed in `design.md` §7): an explicit per-template **storage scope** — `profile` (default for
templates, i.e. today's behaviour) or `event` — decided in one function `writeTargets(field, context)`. Event-only
fields stay registration-only. This keeps every existing flow unchanged until someone switches a template to `event`.

**B — per-event required: exists.** `EventParticipantField.requiredOnRegistration` is per event and is what
`askedFields` uses. What is missing:
- New events do **not** copy the organization default: `createEventWithDefaults` and
  `syncParticipantFieldsForEvent` create event fields without `requiredOnRegistration` (always `false`).
- There are **two meanings** of required: the organization flag `requiredInRegistration` drives the public
  membership form, the portal "requiredEmpty" status and the roster's missing status
  (`/api/events/[id]/participants` GET); the event flag drives what an event registration asks. The inventory's
  "60 required conflicts" are this split, not data errors.
- A required flag only takes effect for template fields while `portalAccess` is edit/approval (`askedFields`).

## 4. Everything that reads a key that may move

| Reader | File / function | Keys | Notes |
|---|---|---|---|
| Adults, travel orders | `src/lib/adults.ts` `ADDRESS_KEYS`; `adults-server.ts`; `travel-orders-server.ts` | `adresa_ulice_cp`, `adresa_mesto`, `adresa_psc` | Read from **`Child.fieldValues`** (profile). Merging the split address into `adresa` breaks these unless they read through the resolver. |
| Kitchen allergy mapping | `src/lib/kitchen/server.ts` (allergy field: setting, else key `alergie` or `allergies`, else label matching /alergi/) | `alergie`, `allergies` | A merge must keep one of these keys or set the kitchen setting. |
| Health PDF / notes | `src/lib/health-notes.ts` `OLD_PDF_KEYS` | `allergies`, `medsNotes`, `chronicIssues`, `otherNotes` | Default health notes. |
| Health detail page | `src/app/events/[id]/health/participants/[participantId]/page.tsx` | `medsNotes` | Filters it out of general notes. |
| Membership / VS | `document-variables.ts` `DEFAULT_MEMBERSHIP_FIELD_KEY`; `Event.vsMembershipFieldKey` | `clenstvi_zare` | Also `clenstvi_rok` (computed). |
| Price rules | `src/lib/price-rules.ts` | category key `oddil` | A price-category key, **not** the `oddil` field — no conflict, but same word. |
| Import guessing | `participant-sync.ts` `guessTarget` | header "oddíl" → `skupina` | Header heuristics, not field keys. |
| Planning import | `planning-import.ts` | "oddil" as a header alias | Unrelated to participant fields. |
| Portal | `portal-server.ts`, `registration-fields.ts` | all template keys | Per key, via templates. |
| Public form | `public-registration.ts`, `public-registration-server.ts` | all template keys | Per key. |
| Mail module export | `mail-sheets-sync.ts`, `/api/events/[id]/mail/participants` | fields with `mail_list` surface | Per key via `fieldTextValues`. |
| Lists / columns | `Event.participantsListColumns`, `documentsListColumns`, `healthListColumns`, `exportColumns`, `participantLayout`, `healthNotes` (JSON configs) | stored key lists | **Saved column configs store keys** — a rename or merge must rewrite these JSONs or resolve aliases. |
| Saved syncs | `Event.participantSyncs[].mapping` | header → key | Same: must be rewritten or alias-resolved. |
| Documents | Google Doc templates `{{key}}` | any | Exact, case-sensitive. |
| Stored values | `Child.fieldValues`, `Participant.customFieldValues` | any | **Verified:** renaming an *event* field (`/api/events/[id]/participant-fields/[fieldId]` PATCH) rewrites that event's composite `parts` and its registrations' values — **not** profiles, saved column configs, saved syncs or Doc templates. Renaming an *organization template* (`/api/participant-field-templates/[key]` PATCH) changes only the template key: existing event copies keep the old key and silently stop matching the template (portal/required rules). See Q8. |
| Tests | `participant-layout.check.ts`, `health-notes.check.ts`, `participant-sync.check.ts` | `allergies`, `medsNotes`, `alergie` | Invented data; update with the change. |

## 5. The 8 duplicate groups (from the inventory) and where each key is read

| Group | Keys | Readers beyond generic lists/documents |
|---|---|---|
| Allergies | `allergies`, `alergie`, `alergie_projevy` | kitchen (`alergie`/`allergies`), health `OLD_PDF_KEYS` (`allergies`); health sheet sync writes `allergies` while the portal asks `alergie` |
| Chronic illness | `chronicIssues`, `chronicka_onemocneni` | health `OLD_PDF_KEYS` (`chronicIssues`) |
| Medication | `medsNotes`, `pravidelne_leky` | health `OLD_PDF_KEYS`, health detail page (`medsNotes`) |
| Address | `adresa`, `adresa_ulice_cp`, `adresa_mesto`, `adresa_psc`, `full_adress` | `ADDRESS_KEYS` (adults, travel orders) read the split keys from the profile; old templates print `adresa` (portal-hidden, empty for portal registrations); `full_adress` is an event-only composite on one event |
| Guardian name | `zast_jmeno`, `zak_zast_jmeno` | fixed fields; both resolve to the same value |
| Membership | `clenstvi_zare`, `clenstvi_rok`, `typ_clenstvi`, `oddil` | VS/price (`clenstvi_zare` default membership key), `clenstvi_rok` computed. **Not true duplicates**: `oddil` = which troop, `typ_clenstvi` = membership type, `clenstvi_zare` = member yes/no, `clenstvi_rok` = computed status — see Q6 |
| Name | `Name`, `participant_first_name`, `participant_last_name` | builtins; `Name` is the stored full name. Calculated-vs-stored question in Q7 |
| Age | `vek_ucastnika`, `datum_narozeni` | `vek_ucastnika` is a template text/number field (manual), the prototype makes it calculated from `datum_narozeni` |

The prototype's merge list (5 groups) differs: it merges **split address → `adresa`** and **`typ_clenstvi` → `oddil`**.
Both directions conflict with the code: adults/travel orders read the split keys, and `typ_clenstvi` ≠ `oddil` in
meaning. See Q5, Q6.

## 6. Event-level values: where they are entered or hard-coded today

| Value | Stored in | Entered at | Printed as today |
|---|---|---|---|
| Event name | `Event.name` | event creation / settings | `{{camp_name}}` (docs, e-mails), `{{event_name}}` (tickets) |
| Dates | `Event.startDate`, `endDate` | event creation / settings | `{{date_range}}` (docs), `{{event_date}}` (tickets) |
| Place | **`Event.location`** (exists) | event settings / public event | `{{event_place}}` (tickets only); documents have no variable — typed into templates |
| Prices | `Event.memberPriceCzk`, `nonMemberPriceCzk`, `priceRules` (categories), ticket types in `ticketSettings` | event settings (registration / prices) | `{{price}}` computed per participant; no "price for members" variable; typed into templates |
| Payment account | `Event.registrationBankAccountNumber` + `registrationBankCode` (used for the QR); also `Event.bankAccountId` → `BankAccount` (bank module); tickets use their own `payment_account` | event settings (registration) / bank module | `{{picture}}` (QR), `{{payment_account}}` in ticket e-mails only — **two account sources**, Q10 |
| Registration deadline | `Event.registrationDeadline` | event settings | `{{registration_deadline}}`, `{{registration_deadline_line}}` |
| Payment deadline | — | — | not stored anywhere; typed into templates |
| Leader | — | — | not stored; typed into templates (inventory: the Velikonoce 2027 template still names the 2026 leader/place/dates/prices — from the inventory, not re-checked) |
| Contact e-mail | `Event.publicContactEmail`, `Event.senderEmail`; `Organization.contactEmail` | event settings / organization | `{{sender_email}}` |
| Contact phone | — | — | not stored |
| Organization name | `Organization.name` (+ `shortName`, `address`, `city`, `ico`) | organization settings | `{{organization_name}}` (the prompt's registry says `org_name`) |
| Questionnaire URL | `Event.mailQuestionnaireUrl` | event settings → Pošta | `{{questionnaire_url}}`, `{{questionnaire_line}}` |
| Portal info / landing text | `Event.portalInfo`, `landingContent`, `publicTexts` | event settings | not variables |

Two separate key vocabularies exist for the same things: documents/e-mails (`camp_name`, `date_range`, …,
`resolveVariables` + `email-template-preview.ts` `VARIABLES_BY_PURPOSE`) and tickets (`event_name`, `event_date`,
`event_place`, `payment_*`, `tickets-server.ts`). The registry should make one the canonical key and the other aliases.

## 7. Other facts that shape the design

- **Composite fields already are calculated fields**: `fieldType = composite`, `options = { parts[], separator, template? }`
  (`participant-fields.ts` `readComposite`, `composeValue`, `renderCompositeTemplate`). The prototype's "join" and
  "free text with {{fields}}" kinds exist; "age from a date" and "if-then-else" do not.
- **Field types**: `text, number, date, boolean, select, image, composite`. The prototype adds `longtext`, `multi`,
  `consent`, `email`, `phone`, `address` — new enum values (additive in PostgreSQL).
- **No consent field exists** anywhere (inventory §9, confirmed: no key/label matching souhlas/consent/gdpr/foto).
- **No aliases** besides `zak_zast_jmeno`.
- **No per-organization feature flag**. Module "packages" (`module-kinds.ts`, commit 3c5b856) are per event kind.
  `AppSetting` is a global key/value table.
- **Guardians (production, read-only count):** every child has exactly 1 `ChildGuardian` (9 children with guardians);
  every registration has exactly 1 `ParticipantGuardian` (40); 0 guardians with an empty e-mail; 0 pending profile
  changes. Six slots is ample and moving to slot keys touches very little data.
- **Tests:** 20 `src/lib/*.check.ts` self-checks (`npx tsx src/lib/x.check.ts`, `node:assert`) and ~15
  `scripts/check-*.ts`. No test runner, no CI. New tests should follow the same pattern.
- **Staging** exists (prompt 12): `fields-*` branches deploy to staging automatically, with invented data, a test
  Drive folder with two test Doc templates and three import sheets (clean, duplicates, bad rows).

## 8. The production design ("What changes" tab) checked against the code

| Claim | Verdict | Evidence |
|---|---|---|
| Registration sheet sync, Medium: 4 saved real mappings use `zast_jmeno`, `vztah`, `zast_telefon`, `Email` | **Confirmed**: 4 connections in 2 events (inventory §8) | `Event.participantSyncs` |
| …the first three keep working as aliases of guardian 1 | Confirmed by design (legacy aliases, `design.md` §4) | — |
| …`Email` becomes calculated, so its mapping must move to `guardian1_email` | **Correction:** `Email` is *already* calculated (`computedType: contact_email`) and *already* an import target that writes the guardian e-mail (`guardianProp: "email"`, `GUARDIAN_EMAIL_FIELD`). Needed: an import-target alias `Email` → `guardian1_email`; no data migration | `fixed-participant-fields.ts`, `participant-sync.ts` |
| …second guardian columns become importable; sync must learn several guardians | **Partly:** several guardians already import, paired by column position (Nth e-mail ↔ Nth name/phone/relation); what's new is explicit slots | `participant-sync.ts` row parsing |
| Payments sync, Medium: `var_symb` becomes calculated, matcher must read the computed value | **Wrong:** `var_symb` is already computed, and matching already reads computed values (`participantKeys` uses `p.values[matchBy]`, filled by `fieldTextValues`; "computed/composite ones match-only"). The "Platby" connection matches by `var_symb` today. No change needed; keep a regression check | `participant-sync.ts` `participantKeys`, `participant-sync-run.ts` `loadImportFields` |
| Public form, Medium: guardian questions become "guardian block, repeat up to N" | **Already exists:** the form takes a repeating guardian list, up to **10** (`o.guardians.slice(0, 10)`), each needing a name and e-mail. Conflicts with the 6-slot maximum → Q17 | `public-registration.ts` |
| Parent portal, Low: guardian edits and "who receives e-mail" move onto the guardian record | **Already there:** `receivesCommunications` is a column on `ChildGuardian` / `ParticipantGuardian` | schema |
| Document generation, Low: old keys resolve through aliases; `guardianN_…` added to the resolver | Confirmed as the design (`design.md` §4) | — |
| Merging, Low: `ADDRESS_KEYS` must be pointed to the address field first | Confirmed reader; with the agreed address decision (split fields stay stored) `ADDRESS_KEYS` **doesn't change** | `adults.ts` |
| Not affected: health questionnaire sync | Confirmed; it writes `allergies`, `medsNotes` (old keys) — keys stay valid | inventory §8 |
| Not affected: mail status export | Confirmed: reads guardians with `receivesCommunications` + document status | `mail-sheets-sync.ts` |
| Not affected: kitchen | Confirmed with a nuance: kitchen finds the allergy *field row* by key `alergie` or `allergies` (not via aliases); merging `alergie` → `allergies` keeps `allergies`, so it still works | `kitchen/server.ts` |
| Suggested order: …make Name, Age, Email, Price, Variable symbol calculated | **Correction:** Email, Price and VS are already calculated; Age (`vek_ucastnika`) is a manual template field (make calculated: fine); Name stays stored (Q7, used for matching and file names) | `fixed-participant-fields.ts` |

Not in the tab, found here: the "Tábor 2026 – official" connection maps PSČ, Město and Ulice **all to `adresa`** (last
one wins) and "Dítě **nesmí** být vydáno" to `vydani_osoby` (opposite meaning, inventory §8). With `adresa` becoming
calculated, that mapping must be moved to the three split keys (plan phase 4).
