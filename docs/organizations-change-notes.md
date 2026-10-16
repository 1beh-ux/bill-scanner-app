# Organizations, step 1: schema, owners, migration to Záře

Design: "Organizations — design draft v1". This step only adds owners. There is no read filtering
and no UI or access change. The app behaves exactly as before.

## Migrations

1. `20261013090000_organizations_foundation` (additive, Deploy A):
   - new table `organizations` (id, name, short_name, contact_email, active, created_at)
   - `organization_id` (nullable, FK, index) on users, events, authors, children, families,
     drive_accounts, mail_sender_accounts, public_hosts, merchant_aliases, category_templates,
     list_templates, email_templates, participant_field_templates
   - `users.is_super_admin` (default false)
   - `source_template_id` (self FK, ON DELETE SET NULL) on the 4 template tables. Unused until step 4.
     On participant_field_templates it points to `key` (that table's primary key).
2. `scripts/migrate-organizations.ts --apply` (between the deploys):
   - creates "Pionýrská skupina Záře" (Záře, 1beh@zare.cz)
   - owns every NULL row
   - makes 1beh@zare.cz super-admin
3. `20261013100000_organizations_required` (Deploy B):
   - `organization_id NOT NULL` on users, events, authors, children, families, mail_sender_accounts,
     public_hosts, merchant_aliases, drive_accounts. FK becomes ON DELETE RESTRICT.
   - Template tables keep it nullable: NULL = app level later.

## Unique keys

| Table | Before | Now |
|---|---|---|
| category_templates | `name` | `(organization_id, name) NULLS NOT DISTINCT` |
| email_templates | `purpose_key` | `(organization_id, purpose_key) NULLS NOT DISTINCT` |
| merchant_aliases | `raw_text` | `(organization_id, raw_text)` |

Unchanged (global): users.email, mail_sender_accounts.email, drive_accounts.email and
connected_by_user_id, events.public_slug, children/families.portal_token, public_hosts.hostname.

Prisma cannot express `NULLS NOT DISTINCT`, so those two index lines were edited by hand in the
migration SQL (Postgres 16). `prisma migrate dev` may report them as drift; keep the hand-edited version.

Code switched to the compound keys:
- `src/lib/email-template.ts` `getOrCreateOrgEmailTemplate(organizationId, purposeKey)`
- `src/app/api/email-templates/route.ts` (save)
- `src/lib/merchant-aliases.ts`:
  - `resolveCanonicalMerchant(raw, organizationId)`, called from `process-bill-ai.ts` with the bill's event's org
  - `recordMerchantCorrection(raw, corrected, organizationId)`
- `scripts/fix-stale-default-email-templates.ts`: loops over every organization's row.

**Deploy window:** the Part 4 migration runs about 8 minutes before the Deploy B code is live. The
Deploy A code therefore writes those three tables with find + create/update, not `upsert`. Prisma's
upsert is `INSERT … ON CONFLICT (purpose_key)`, which fails once that unique is dropped.

## Who owns a new row (`src/lib/org-owner.ts`)

- `orgIdOfEvent(eventId)`: inside an event.
- `orgIdOfUser(user)`: a logged-in user outside an event.
- `orgIdForSeeds()`: seeds and test scripts. `SEED_ORGANIZATION`, default "Pionýrská skupina Záře",
  created if missing.

Every create site (found by making the columns required and letting `tsc` list them):

| Site | Table | Owner |
|---|---|---|
| api/events POST | Event | user |
| api/users POST | User | user |
| api/authors POST | Author | user |
| api/events/[id]/payers POST | Author | event |
| lib/drive-import `findOrCreateAuthorForSubfolder(name, eventId)` (Drive import + bills import run) | Author | event |
| api/children POST "link" new | Child | participant's event |
| lib/children `linkChildren` | Child | participant's event |
| lib/public-registration-server (family + people, nested guardians) | Family, Child | event |
| lib/portal-server `addFamilyMember` | Child | the family's org |
| api/families POST "create" | Family | user |
| api/mail-oauth/callback (Drive + mailbox upserts, create branch) | DriveAccount, MailSenderAccount | user |
| api/public-hosts POST | PublicHost | user |
| lib/merchant-aliases `recordMerchantCorrection` (from api/bills/[id]) | MerchantAlias | bill's event |
| api/category-templates POST | CategoryTemplate | user |
| api/list-templates POST | ListTemplate | user |
| lib/planning-activities `saveActivitiesAsTemplates` | ListTemplate | event |
| api/email-templates POST, lib/email-template `getOrCreateOrgEmailTemplate` | EmailTemplate | user / event |
| api/participant-field-templates POST + from-events | ParticipantFieldTemplate | user |
| prisma/seed.ts, scripts/seed-participant-field-templates.ts | User, CategoryTemplate, ListTemplate, ParticipantFieldTemplate | seed org |
| scripts/verify-*.ts (5 test scripts) | User, Event, Author, DriveAccount, ListTemplate | seed org |

There are no raw-SQL inserts into these tables.

## Backfill output (production, 2026-10-10)

```
table                          total  updated  NULL after
users                              7        7    0
events                             9        9    0
authors                           11       11    0
children                           4        4    0
families                           0        0    0
drive_accounts                     3        3    0
mail_sender_accounts               2        2    0
public_hosts                       2        2    0
merchant_aliases                   1        1    0
category_templates                14       14    0
list_templates                    32       32    0
email_templates                    6        6    0
participant_field_templates       16       16    0
organizations: 1, super-admins: 1beh@zare.cz
```

## Deploys

| Step | Build ID | Revision |
|---|---|---|
| before | | `bill-scanner-app-00092-57n` (rollback target) |
| A (commit 5642437) | 69e47502-0c31-4cb5-841b-cfdec9944b85 | 00093-bst |
| B (master 11ed281) | 6fcd70fb-4b88-4173-9e91-980e5c76e0df | 00094-blt |

## Open for later steps

- `participant_field_templates.key` is still the global primary key, so two organizations cannot have
  the same field key yet. Step 4 has to change that.
- Event creation still copies *all* category templates, and template lists are global. Read filtering
  is step 2.

# Step 2: scoping layer (branch orgs-2)

Every request now acts inside one organization. With only Záře in the database, everything works
as before, except the super-admin pages listed under "Behaviour changes".

## Guards (`src/lib/org-scope.ts`)

- `getActingOrgId(user)`: the user's own organization. A super-admin gets the `acting_org` cookie
  instead, when it names an active organization. The switcher UI comes in step 3.
- `requireEventInOrg` / `eventInOrg`: 404 (not 403) for an event outside the acting organization.
- `requireOrgAdminEvent(eventId)`: signed in, admin, and the event is in the organization.
- `isOrgAdmin(user)`: `isSuperAdmin || role === "admin"`. An ordinary user always acts in their own
  organization.
- `requireSuperAdmin`.
- `orgWhere(user)`, `authorInOrg`, `childInOrg`: list filters and owner checks for ids.
- A deactivated organization: its users are refused at `/api/session` and get null from
  `getCurrentUser`, the same as inactive users.
- The module-access guards (`hasModuleAccess`, `requireModuleAccess`, `requireAnyModuleAccess`,
  `requireListItemAccess`, and `authorizePlanning`, which wraps them) check the event's organization
  first. That covers every event route behind them, including all 14 planning routes.
- New rows: `orgIdOfUser` now returns the acting organization.

## Files and the guard used

- **`isOrgAdmin` instead of `role === "admin"`** (47 server checks in 31 files): authors*,
  admin/overview, children*, families, participant-field-templates*, events/[id]
  (+ modules, module-access, people-unlink, list-items/drive-import, portal-eligibility,
  planning/activities/to-templates, participants, participants/bulk), events, users*, email-templates,
  list-templates*.
- **Client checks** (`role === "admin"` in about 18 UI places) are unchanged: `/api/me` now returns
  the *effective* role plus `isSuperAdmin`.
- **`requireSuperAdmin`:** translations (writes), exchange-rates (+ sync, recalculate), public-hosts
  POST and [id] PATCH.
- **`requireOrgAdminEvent`:** events/[id]/people-unlink, list-items/[itemId]/drive-import,
  portal-eligibility, planning/activities/to-templates.
- **`requireEventInOrg`:** events/[id] DELETE, events/[id]/modules PATCH, events/[id]/module-access
  (grants only to the event's organization's users).
- **`orgWhere` / `getActingOrgId` lists:**
  - users, events (switcher, move targets, pickers), admin/overview (events + Google accounts),
    authors, children (+ `?list=1`), families, category-templates, list-templates,
    participant-field-templates, mail-accounts, public-hosts.
  - New events copy only their organization's category, list and field templates.
- **Owner checks by id (404):**
  - users/[id], authors/[id] (+ events, merge (target too), bank-audit), children/[id]
    (+ documents, documents/[docId])
  - families: every family and person id in any action
  - category-templates/[id], list-templates/[id] (+ permanent), participant-field-templates/[key]
  - public-hosts/[id] (+ verify), children/portal-email targets
- **Inside one organization:**
  - `linkChildren` groups participants by their event's organization and matches or creates
    people only there.
  - `fillMissingGuardians` and `eligibilityFacts` take an organization.
  - Payer matching: `findSimilarAuthors`, payers/search, Drive sub-folder import, bills import.
  - Field templates: `visibleTemplates`, `templateRules`, `portalAccessMap`, `profileFieldLabels`,
    `syncParticipantFieldsForEvent`, `copyProfileFromLatest`.
  - "Platí trvale" document keys, the planning activity library, and the Drive document import's
    person list.
- **Public hosts are per organization (`public-host.ts`):**
  - `resolvePublicHost` returns the host's organization.
  - `/r` is served only when the event's organization owns the host, `/p` only when the family's or
    person's does.
  - Defaults, `publicUrl`, `portalUrl` and the admin-host redirect use the event's, family's or
    person's organization.
  - The portal's events to register for and its fields are the family's organization's.
  - Writes are super-admin only; organization admins see a read-only list and can run Ověřit.
- **Ids from a request that must belong to the event (found during the audit; before, they could
  reach another event or organization):**
  - an event's sending mailbox must be one of its organization's (`health/sender-email`)
  - mail/messages/execute participants
  - the manual document-received toggle
  - bills/bulk-ai bill ids
  - bulk status e-mails and bulk participant e-mails
- **Cron:** every job works one event at a time with that event's data. Participant sync links
  through the organization-safe `linkChildren`. Nothing changed there.

## `scripts/check-org-scope.ts` allow-list

The script flags every route or server page that touches an org-owned table or an event id
without a guard. Result: 185 files, 0 unexplained. Allow-listed:

| File | Reason |
|---|---|
| api/session | login itself (the user by the verified Google e-mail) |
| api/me | the signed-in user's own row |
| api/me/google-account | the user's own Google connection |
| api/config/drive-account | the service account address, the same for everyone |
| api/cron/mail-drive-sync, mail-sheets-sync | cron (CRON_SECRET), one event at a time |

Further entries cover routes that don't currently need a guard (translations, exchange-rates/lookup,
the other crons, tasks, mail-oauth/authorize, the public 404 and landing page). Each has its reason
in the script.

## `scripts/test-org-isolation.ts`

The test creates "Test org (isolation)" with an admin and an event (through `POST /api/events`).
It calls the real route handlers as that admin; `tsconfig.org-isolation.json` stubs
`getCurrentUser` and `next/headers`, so there is no test hook in the app code. Then it deletes
everything, also on failure.

Production, 2026-10-10: **23/23 passed**, cleanup ok.
- **Lists:** events, users, payers, Lidé, picker, families, category, list and field templates,
  mailboxes, public hosts, admin overview and the access grid show no Záře data.
- **404:** Záře event, bill, person, payer, category template, list template and field template.
- `hasModuleAccess` on a Záře event is false.
- A participant with the same name and birth date as a Záře person is not linked to Záře.

Skipped: the family 404 (Záře has no families yet).

Mutation check: with the user list's organization filter removed, the test fails (22/23).

## Behaviour changes

- Překlady and Kurzy: super-admin only (API + sidebar).
- Veřejné adresy: adding and editing super-admin only.
- Event creation copies only the organization's templates. For Záře that's the same as before.

## Open

- category-templates POST/PATCH/DELETE have no admin check: any signed-in user. This was already
  the case before, so it is unchanged here.
- `participant_field_templates.key` is still global (step 4).
- The from-events candidates skip keys used by any organization.

## Deploy (step 2)

| Attempt | Build ID | Result | Revision |
|---|---|---|---|
| before | | | `bill-scanner-app-00094-blt` (rollback target) |
| 1 | 5e3599ef-1754-4d96-9a38-b5c8330ae108 | FAILURE: Node heap OOM in Next's type check (Docker build) | no change |
| 2 (+ Dockerfile: `NODE_OPTIONS=--max-old-space-size=4096` for `npm run build`) | bd5db4f5-94aa-4031-a44a-a2cc004ff7e0 | SUCCESS | 00095-sgj |

Checks after the deploy: tabornik.online/login 200; prihlasky /r/clenstvi-2027 200; rodice / 200;
tabornik /r → 308 prihlasky; rodice /r → 404; no errors logged.

# Step 3: super-admin screens (branch orgs-3)

## Acting organization
- `POST /api/acting-org {organizationId | null}` (super-admin): sets or clears the `acting_org`
  cookie. The cookie is httpOnly, host-only, SameSite=Lax, path /. Only active organizations are
  accepted. Choosing the home organization clears the cookie.
- The client forgets the remembered event and reloads `/`. The event switcher then falls back to
  the first event of the new organization.
- `/api/me` returns `organization` (acting) and `homeOrganization`.
- Sidebar (desktop + mobile drawer), above the event switcher, super-admin only:
  "Organizace: <zkratka>".
- While the acting organization is not the home one: a sticky ember strip "Pracujete v organizaci
  <název>" with "Zpět do <zkratka>" (`src/components/ActingOrg.tsx`).

## APLIKACE (super-admin only, hidden for everyone else)
- **Organizace** (`/admin/organizations`, `GET/POST /api/organizations`, `PATCH /api/organizations/[id]`):
  - Table: name, short name, contact e-mail, admins, user/event/host counts, active.
  - "Nová organizace" creates the organization and its first admin in one transaction. An e-mail
    that already has an account is refused: "Tento e-mail už má účet v organizaci X".
  - No templates are copied; the hint under the form says so (step 4).
  - Edit, Přepnout, Deaktivovat/Aktivovat (ConfirmDialog). The home organization can't be
    deactivated.
- **Veřejné adresy** (`/admin/public-hosts`, `GET /api/public-hosts?all=1`): every organization's
  hosts, with an Organizace column and select.
  - POST and PATCH take an `organizationId`.
  - An event-tied host must belong to the event's organization (`checkHostInput`, otherwise
    `bad_event`).
  - Ověřit works on any host for a super-admin.
- **Překlady** and **Kurzy** moved here from ORGANIZACE.
- ORGANIZACE → Připojení: the organization's own hosts, read-only, with Ověřit. Both pages share
  `src/components/PublicHostsAdmin.tsx`.

## Deactivated organization
- Its users can't log in (step 2).
- Its public hosts are no longer resolved: `activeHosts` requires `organization.active`, so they
  answer 404 and are never used in links.
- Deactivating it while acting in it clears `acting_org`.

## Admin role
- Granting or removing `admin` (users POST + PATCH): `requireSuperAdmin`.
- Uživatelé page: the "admin" option only for a super-admin. Organization admins see an admin's
  role read-only.
- The last active admin of an organization can't be deactivated or demoted (`last_admin`).
- `isSuperAdmin` is not settable through any API: users PATCH takes only displayName, role and
  active.

## Tests
`scripts/test-org-isolation.ts --run` (production): **34/34 passed**, cleanup ok. The 23 step-2
checks, plus:
- An organization admin gets 403 on GET/POST /api/organizations, POST /api/acting-org, making
  someone admin, and creating an admin.
- `acting_org` is ignored for a non-super-admin.
- A super-admin acting in the test organization sees only its events and users.
- The last active admin can't be deactivated.
- A deactivated organization's host resolves as unknown (404).
- The home organization can't be deactivated.

`check-org-scope`: 188 files, 0 unexplained. Build ok.

Texts: `scripts/seed-organizations-i18n.ts` (cs + en). The deploy flow runs it.

Deploy (step 3): build dc620a3c-649e-429d-b284-9e6626e054b5 SUCCESS -> `bill-scanner-app-00096-zpz`
(rollback target `00095-sgj`). Checks: tabornik.online/login 200, prihlasky /r/clenstvi-2027 200,
rodice / 200, /api/organizations and /api/acting-org without a session 401, no errors logged.

# Step 4: app templates (branch orgs-4)

Templates on three levels: app (organization_id NULL) → organization → event.

## Open items from step 2, fixed
- **participant_field_templates**: `id` is the primary key. `key` is unique per organization; NULL
  (app level) counts as one group (`NULLS NOT DISTINCT`). `source_template_id` now references `id`.
  - `20261014090000_field_template_id_additive`: `id` with the DB default `gen_random_uuid()` (older
    code inserting during the deploy window still gets one); unique index; the unused self-FK on
    `key` dropped.
  - `scripts/migrate-field-template-ids.ts`: checks/fixes ids, converts source ids, finds duplicates.
    Production: 16 rows, 0 without id, 0 to convert, 0 duplicates.
  - `20261014100000_field_template_id_tighten`: primary key → `id`; unique (organization_id, key)
    NULLS NOT DISTINCT (hand-edited SQL); FK source_template_id → id ON DELETE SET NULL.
  - **References changed:**
    - `participant-field-templates/[key]`: finds by (organization, key), updates and deletes by id;
      the "key taken" check is per organization.
    - `from-events`: only the organization's own keys count as taken.
    - scripts `normalize-participant-field-surfaces`, `deactivate-duplicate-name-field`,
      `fix-tshirt-size-casing` (update by id), `rename-medsnotes-label` (every organization's row),
      `seed-participant-field-templates` (find + create/update instead of upsert by key).
  - Event fields and profile values match by key *value*. Since step 2 those lookups are filtered
    by organization, so they are unchanged.
- **category-templates** POST/PATCH/DELETE require `isOrgAdmin`; before, any signed-in user could
  call them. The other template routes already checked.

## App level (Aplikace → Šablony aplikace, `/admin/app-templates`)
- `TemplatesEditor`, the same component as Organizace → Šablony, inside
  `TemplateLevelProvider value="app"`. The editors add `?level=app`.
- `src/lib/template-scope.ts` `templateScope(req, user, write)`: with `level=app`, the app rows,
  super-admin only (reads too); otherwise the acting organization's rows (writes: its admins).
  Category, list, field and e-mail template routes use it.
- On the app level, "platí trvale" and "Z akcí" are hidden: they are organization concepts.
- Organization lists and event copies filter `organization_id = X` or go through the event's
  organization, so they never see app rows.

## Starter set: `scripts/create-app-templates.ts`
- Copies every Záře template to the app level and sets the Záře rows' `sourceTemplateId` to the
  copy.
- App copies drop Google Doc ids and bank fields from `data`/`options`. There were none.
- It is idempotent: already linked rows are skipped, and an existing app item with the same identity
  is linked instead of copied.
- Production (after the tighten migration):
  - copied: 14 category, 32 list, 6 e-mail, 16 field templates
  - flagged (dry run and after apply): **`[field] Je členem organizace -- key clenstvi_zare`**
  - texts: no names, e-mails, URLs, IBANs, account numbers or phone numbers (checked again
    independently with SQL)

## Sync organization ← app (`src/lib/app-templates.ts`, `/api/app-templates`, `AppSyncPanel`)
- Under each section of Organizace → Šablony: badges **Výchozí** (equal to the app source),
  **Upraveno**, **Vlastní** (no app source).
- **Porovnat**: the fields that differ, organization vs app.
- **Obnovit z aplikace**: one item, with ConfirmDialog.
- **Načíst nové z aplikace**: copies the app items the organization doesn't have yet (not copied
  before and no own item with the same name / kind+name / purpose / key). It shows "Načteno N
  položek" or "Nic nového".
- Nothing is pushed: editing an app template changes no organization.
- A new organization (Aplikace → Organizace) gets copies of every active app template, with
  `sourceTemplateId`, in the same transaction (timeout 60 s). The "no templates" hint is replaced.

## Order (deviation from the prompt)
`create-app-templates` ran *after* the tighten migration, not between the two migrations. While
`key` was the global primary key, an app copy of a Záře field (same key, organization NULL) would
have violated it. The run order was:
1. Deploy A (additive)
2. id script
3. tighten migration alone (the Deploy A code works with it)
4. create-app-templates
5. isolation test
6. Deploy B

## Tests
`test-org-isolation --run` (production): **41/41 passed**, cleanup ok. On top of step 3, it covers:
- An organization admin gets 403 on app-template writes and reads.
- One organization's own templates are invisible to the other, both ways.
- A new organization gets copies of all active app templates.
- Obnovit turns Upraveno back into Výchozí.
- Načíst nové copies 1, then 0.
- Obnovit on another organization's item → 404.

`check-org-scope`: 189 files, 0 unexplained; `templateScope` was added to its guard list. Build ok.

## Deploys (step 4)

| Step | Build | Revision |
|---|---|---|
| before | | `bill-scanner-app-00096-zpz` (rollback target) |
| A: additive migration + category admin check (commit 67fdbb8) | 96723ea4-a03d-4661-96cd-8768fe936089 SUCCESS | 00097-jxg |
| B: tighten (applied ahead, see Order) + all step 4 code (master 694fc9e) | 0f879d08-0ecc-487e-a046-df00a67f386a SUCCESS | 00098-6wz |

Deploy A's build succeeded, but gcloud's Cloud Shell login (metadata credentials) expired while it
waited, so it looked like a failure. gcloud was logged in again with `gcloud auth login`. The Cloud
SQL proxy now runs with `--gcloud-auth`.

Checks: tabornik.online/login 200, prihlasky /r/clenstvi-2027 200, rodice / 200,
/api/app-templates and ?level=app without a session 401, no errors logged.

# Step 5: public pages show their organization (branch orgs-5)

- **Registration form** (`/r/<slug>`, form and "thank you" screen) and **parent portal**
  (`/p/<token>`, including the birth-date gate):
  - the organization's name above the header
  - title `<event or form> · <organization>` / `Rodičovský portál · <organization>`
  - footer "Kontakt: <contact e-mail>" when the organization has one
  - The organization is the event's (form) or the family's / person's (portal). Never
    tabornik.online, never another organization's name.
  - `src/components/registration/OrgBrand.tsx`; `publicOrg()` in `src/lib/public-host.ts`
    (cached per request).
- **Landing page** of a public host: the host's organization (name, title, contact). An unknown
  host or a deactivated organization's host → 404 (the neutral 404 page).
- **E-mails:** there were no hard-coded organization names in code or templates. The only hits for
  "Záře" are the seed defaults in `org-owner.ts` / `prisma/seed.ts`, which are correct. The sender
  fallbacks ("Tábor", "Zdravotník", "Pošta tábora") are generic.
  - New variable **`{{organization_name}}`** in every e-mail and document variable set:
    `resolveVariables` (participant e-mails, acceptance, generated documents) and the portal-link /
    invitation e-mails. It is also in the variable palette of every purpose (preview value
    "Turistický oddíl Sluníčko").
- **Tests:** `test-org-isolation --run` 43/43.
  - The test organization's form shows "Test org (isolation)" in the header and title, with no
    Záře/Pionýr text.
  - Its host's landing page shows its name, and 404 once the organization is deactivated.
- `check-org-scope` 0 unexplained, `check-proxy-hosts` all passed, build ok.

# Bank payment check (branch bank-check)

Spec: docs/bank-payments-design.md. A participant's payment is confirmed when the money arrives on
the organization's Fio account: a settled movement creates the event's payment document
(Event.paymentDocTypeId) with receivedVia `bank`, so lists, counters and the portal work unchanged.

- **New organization-owned table `bank_accounts`** (organizationId required). Guard:
  `requireOrgBankAccount` in src/lib/org-scope.ts (org admin + the acting organization's account,
  else 403/404). Listed in check-org-scope's ORG_TABLES (with `bank_movements`, which hangs off an
  account) and covered by test-org-isolation. check-org-scope also flags any `console.*` in
  src/lib/bank or a bank route that mentions a URL, token or fioapi.
- **`bank_movements`** belong to an account; event routes (`requireEventBank`: roster module access)
  only reach the event's own account and participants.
- Migration `20261015090000_bank_check` (additive): the two tables, Event.bankCheckEnabled /
  bankAccountId, Participant.acceptedVariableSymbol (set at acceptance send next to
  acceptedPriceCzk), MailDocReceivedVia `bank`.
- The Fio token is encrypted with BANK_TOKEN_ENC_KEY (secret `bank-token-enc-key`), never returned,
  logged or put in an error; the Fio call uses node:https, so Next's fetch logging never sees the URL.
- Cron: Cloud Scheduler job `bank-check` (europe-west3, every 30 min, Europe/Prague) ->
  POST https://tabornik.online/api/cron/bank-check with x-cron-secret.
- Onboarding: optional step after 5 -- the admin connects the organization's Fio account in
  Organizace -> Připojení -> Banka and switches "Automaticky ověřovat platby z banky" on per event
  (Nastavení akce, next to Dokument platby; the event's payment account must equal it).

Deploy (bank check): migration applied before the tests; build 2db72fb6-c435-435b-89b1-bcc750ae320b
SUCCESS -> `bill-scanner-app-00100-jdp` (rollback target `00099-hjz`). Checks: tsc, eslint (no new
errors), build, check-bank-matching 17/17, check-org-scope 0 unexplained, test-org-isolation 53/53;
tabornik.online/login 200, prihlasky /r/clenstvi-2027 200, rodice / 200, no errors logged; scheduler
run -> 200 `{"ok":true,"accounts":0,"results":{}}`.

# Účastníci + e-mail restructure (branch ucastnici-mail)

- **Účastníci** menu: Seznam účastníků, **Dokumenty** (moved from Pošta, `/events/[id]/participants/documents`,
  old URL redirects; reachable with health or mail), **Poslat e-mail**, **Platby na účet** (only when the
  event's bank check is on; `modules/mine` returns a `bankCheck` flag), Import.
- Dokumenty: "Synchronizovat dokumenty" (`/api/events/[id]/documents/sync`: every sheet connection, Drive
  copies, status sheet) + the list of connected sheets and the document each ticks + "Zkontrolovat platby".
  The roster no longer has the bank button.
- Nastavení akce -> **Platba a účet** (`PaymentSettings`): prices, payment account, variable symbol, QR size,
  Dokument platby + bank check (any event, not only portal-connected ones), price rules. Removed from Akce,
  Veřejná přihláška, Portál and the field editor (VS / QR fields link here).
- E-mail types in one list (`src/lib/email-kinds.ts`): Poslat e-mail's submenu, Nastavení akce -> Mail (every
  template; portal link / invitation are organization-only and link to Šablony) and Šablony -> **Šablony
  e-mailů** (new section; Zdraví lost its E-mail subtab). Šablony "Pošta" -> **Sledované dokumenty**,
  "Účastníci" -> **Proměnné (sloupce)**.
- **Own e-mails**: `custom_…` purpose keys with a `name` (migration `20261016090000_own_email_templates`,
  additive) on `email_templates` (organization-owned, already guarded) and `event_email_templates`
  (event-only ones). Sent from Poslat e-mail through the open-e-mail compose page (`?template=`).
- Poslat e-mail: blank / own / portal e-mails go to participants picked on the page (status, state, group,
  search); acceptance, document status, reply and health summary explain why they're launched elsewhere and
  link there. Pozvánka do portálu / nový rok is now launchable from an event (`/children/compose?purpose=invitation`).

Deploy: build d7bb77fa-3479-4bc2-90e2-dea278479fd6 SUCCESS -> `bill-scanner-app-00101-pdj` (rollback target
`00100-jdp`). Checks: tsc, eslint (no new errors), build, check-org-scope 0 unexplained, check-bank-matching,
test-org-isolation 57/57; login / prihlasky / rodice 200, no errors logged.

# Embedding + appearance (branch embed)

Details: docs/custom-domain.md "Embedding" / "Appearance", spec docs/embed-design.md. Organization-owned
additions: `PublicHost.embedOrigins` / `embedPageUrl` (super-admin only; organization admins read them)
and `Organization.public*` appearance fields (edited by the organization's admin for the acting
organization only). Migration `20261017090000_embed_appearance` (additive).

Deploy: build f497767b-b926-49ea-9081-db5e7f798190 SUCCESS -> `bill-scanner-app-00102-7px` (rollback target
`00101-pdj`). Checks: tsc, eslint (no new errors), build, check-proxy-hosts, check-org-scope 0 unexplained,
test-org-isolation 62/62, scripts/embed-check.sh against production all passed. Záře: www.zare.cz +
zare.cz allowed on prihlasky + rodice; rodice's embedPageUrl NOT set (https://www.zare.cz/rodicovsky-portal
is 404 -- portal links would break); set it with `scripts/set-zare-embed.ts --apply --page` once the page exists.

# Bills UX fixes (branch bills-ux)

- Bill PDF preview blank since the embedding release: `/api/*` sent `X-Frame-Options: DENY`, which also
  blocked our own iframes (bill detail, import preview). Now `SAMEORIGIN` (other websites still can't frame).
- Bill detail note: 4 rows; a dragged height is remembered per user (`uiPrefs.billNotesHeight`).
- Bill list: Excel-like column filters; "Změnit hodnotu" for selected bills (payer, category, date,
  merchant, note -- through the per-bill PATCH / categories PUT, so locks, payer checks, CZK
  re-conversion and the audit log apply); "Synchronizovat s Diskem" + status (on Drive / approved,
  newest upload, missing, not approved).

Deploy: build 06b64c6a-8473-4aa2-816a-8e1cbc25f283 SUCCESS -> `bill-scanner-app-00103-8sx` (rollback target
`00102-7px`). Checks: tsc, eslint (no new errors), build, check-proxy-hosts, check-org-scope, test-org-isolation
62/62, embed-check all passed; /api file responses carry X-Frame-Options: SAMEORIGIN.

# Settlement with the organization (branch settlement)

- Payers (Author, organization-owned): `isOfficialAccount` (bills paid from the organization's official
  account; implies no payout) and `payoutNeeded`; payouts only where `needsPayout` (src/lib/payout.ts).
- `EventDeposit` (event-owned, bills module): deposits from the organization (Rozpočet -> Zálohy).
- Settlement (src/lib/settlement.ts, self-check settlement.check.ts): official = no payer or the official
  account, cash = the rest, to return = deposits - cash; Rozpočet -> Vyúčtování (live or approved only, QR
  to the official payer's account) and the manifest's second sheet "Souhrn" (approved bills).
- Manifest category layout per event (`Event.manifestCategoryMode`: pairs | columns).
- Public pages: `Organization.publicTheme` / `publicTransparent` / `publicContentWidth`.
Migration `20261018090000_settlement` (additive).

Deploy: build f1795cd1-26b6-4b5d-ab14-2525d1fb9565 SUCCESS -> `bill-scanner-app-00104-ljd` (rollback target
`00103-8sx`). Checks: tsc, eslint (no new errors), build, settlement + proxy self-checks, check-org-scope,
test-org-isolation 62/62, embed-check all passed.

# Usage metrics & cost tracking (branch usage-metrics, super-admin only)

- `UserActivity`: one row per page a signed-in user opens (src/components/ActivityTracker.tsx -> POST
  /api/activity). Route pattern from the app's own route params (`useParams`), server drops id-like
  segments; organization = acting org; event only if in it. Deleted after 12 months by the daily ČNB cron.
- `AiUsage`: every Gemini call via `extractBillWithAi` (the only call site) incl. failures. bill-scanner-ai
  returns `model` + `usage` (prompt / output / thinking tokens). userId: reprocess button = clicker, bulk
  "AI" = clicker (task header x-ai-user), stuck-bill requeue = null. costUsd frozen from AppSetting
  "gcpPrices" (Využití -> Ceny GCP).
- `sizeBytes` on Bill (current + kept original), Incident, IncidentUpdate, ParentEmailLog,
  ParticipantDocument, PersonDocument; set at every GCS write; scripts/backfill-gcs-sizes.ts for old rows.
  Storage sums count each GCS path once (shared PDFs / photos).
- /vyuziti + /api/usage/* (requireSuperAdmin), event cost card in Nastavení akce -> Akce.
Migration `20261019090000_usage_metrics` (additive).

Deploy: bill-scanner-ai `00002-m7s` (rollback `00001-qn5`; source in ~/bill-scanner-ai, not in git);
app build 16bf602b-39e4-400c-b202-87803c5b204c -> `bill-scanner-app-00105-pmk` (rollback `00104-ljd`).
Checks: tsc, eslint (no new errors), build, self-checks, check-org-scope, test-org-isolation 72/72, live
bill through the prod worker twice -> 2 AiUsage rows (extraction / reprocess, tokens, cost, user).
Backfill: 291 rows (bills 265 = 346.7 MB, participant docs 23, person docs 3), 0 objects missing.

# Bills UX round 2 + Gemini 3.8 Flash (branch bills-ux-2)

- Drive sync re-uploads an exported bill whose file is gone from the export folder (same name).
- Column filter edits a draft (Použít / Zrušit); list filters + shown order kept per tab
  (src/lib/bill-nav.ts) and the bill detail walks that order; Schválit / Uložit a další no longer ask
  about changes they just saved; moving a bill to another event stays here and opens the next bill.
- Fix before this: BigInt sizeBytes broke JSON of whole bill rows (bill lists empty, revision 00105);
  BigInt.prototype.toJSON in src/lib/prisma.ts; isolation test covers the bill list.
- bill-scanner-ai: gemini-2.5-pro (retired Oct 2026) -> gemini-3.8-flash via the Vertex EU endpoint
  (SDK workaround: full EU model resource name); prompt gives today's date for two-digit years;
  a future / >400-day-old date never auto-approves. 20 approved bills: totals 20/20, dates 18/20,
  categories 15/20 (2.5 Pro: 19/17/13). Price 0.75 / 3.75 USD per 1M (intro until 2026-12-31).

Deploy: bill-scanner-ai `00003-8g6` (rollback `00002-m7s`); app build 11c44bab-4414-43d4-bfc4-f402d826e95a ->
`bill-scanner-app-00107-skn` (rollback `00106-cqs`). Checks: tsc, eslint (no new errors), self-checks,
test-org-isolation 73/73, embed-check.

# Úklid Disku + Zpracované soubory (branch drive-cleanup)

- Úklid souborů na Disku (Účtenky menu, src/lib/drive-cleanup.ts): Drive folders scanned as the event's
  Drive connection; files matched to the organization's bills without downloading -- Drive's SHA-256 vs
  Bill.contentHash (and split-PDF page hashes), the Drive link (driveSourceFileId), the export name
  (weak). Duplicates: the copy a bill uses is kept, others proposed for the bin. Move keeps file ids;
  "delete" = Drive bin only. Bill details only for events with Účtenky access.
- Event.driveProcessedFolderId (Nastavení akce -> Připojení): after a Drive import, files that are bills
  (or duplicates of one) move there; failures shown in the import result.
- Bill detail: Zdroj line (Drive import with a link to the file, upload, camera, bank).
Migration `20261021090000_drive_processed_folder` (additive). Deploy `bill-scanner-app-00112-4p6`
(rollback `00111-4m6`). Checks: tsc (full), eslint (no new errors), build, drive-cleanup self-check,
check-org-scope, test-org-isolation 73/73. Not run against real Drive here (the event's Drive token is
decrypted only in production) -- first real scan by Pavel.

# How to onboard a new organization

1. **Organization + first admin:** as super-admin, Aplikace → Organizace → **Nová organizace**:
   name, short name, contact e-mail (shown in the public pages' footer), and the first admin's
   e-mail + name.
   - The e-mail must not have an account yet; the form says which organization has it.
   - The organization gets copies of all active app templates.
   - The admin signs in at https://tabornik.online with that Google account.
2. **Templates:** the organization's admin reviews Organizace → Šablony (e-mails, documents,
   categories, participant fields, health, planning). They adjust their own copies (badge
   "Upraveno"), "Načíst nové z aplikace" brings later app additions, and "Obnovit z aplikace" undoes
   one item.
   - Before onboarding, check Aplikace → Šablony aplikace for anything organization-specific (the
     flagged list from `create-app-templates`).
3. **Users:** the admin adds users (Organizace → Uživatelé) and grants module access per event.
   Only a super-admin can make someone an admin.
4. **Google account (Drive):** each user connects their own Google account from an event's
   "Připojení" tab: Drive folders, import, export. The connection belongs to the organization.
5. **Mailbox:** the admin connects the sending Gmail from an event's Připojení tab. That mailbox
   is the organization's; other events of the same organization can reuse it, and other
   organizations never see it.
6. **Public domains** (optional; without them the public pages run on the APP_BASE_URL host):
   - a. **Certificate** (super-admin, Google Cloud). Aplikace → Veřejné adresy → "Příkazy" on the
     row gives these with the hostname filled in:
     ```
     gcloud certificate-manager dns-authorizations create <n>-auth --domain=<host>
     gcloud certificate-manager dns-authorizations describe <n>-auth   # -> CNAME _acme-challenge… to add at the domain's DNS
     gcloud certificate-manager certificates create <n>-cert --domains=<host> --dns-authorizations=<n>-auth
     gcloud certificate-manager maps entries create <n>-entry --map=tabornik-map --certificates=<n>-cert --hostname=<host>
     ```
   - b. **Row:** Aplikace → Veřejné adresy → add the hostname with organization = the new one,
     purpose (Přihlášky / Rodičovský portál / Obojí), optionally an event, default.
   - c. **DNS** at the organization's provider: `CNAME <host> -> public.tabornik.online`.
   - d. **Ověřit** on the row (DNS → certificate → landing page; the landing page now shows the
     organization's name).
   - e. Old links on tabornik.online then 308 to that host. New links in e-mails and documents use
     it.
7. **First event:** the admin creates it (Organizace → Akce). It copies the organization's category,
   list and field templates. Turn on the modules, "Připojeno k registraci", and the public form
   (slug) if needed. Then test the public form on the organization's domain.
8. **Check as super-admin:**
   - Přepnout into the organization: the strip "Pracujete v organizaci …", only its data visible.
   - Its public form shows its name in the header and title.
   - Back with "Zpět do Záře".

Deploy (step 5): build f03c9b70-6245-4805-969b-be03bf923a6a SUCCESS -> `bill-scanner-app-00099-hjz`
(rollback target `00098-6wz`). Checks: prihlasky /r/clenstvi-2027 title "Členství 2027 · Pionýrská
skupina Záře", prihlasky / title "Přihlášky a rodičovský portál · Pionýrská skupina Záře",
rodice / 200, tabornik.online/login 200, no errors logged.
