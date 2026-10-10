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
