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
