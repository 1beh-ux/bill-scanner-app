# Fields Manager — design

Date: 2026-11-21. Builds on `findings.md`; open points are in `questions.md` and marked **(Q n)** here.
Nothing here has been implemented. Where a choice depends on an open question, the design states the default it assumes.

**Decided 2026-11-21:** decision A via a per-template `storage` setting (§7); decision B as in §8; documents falling back
to the profile and imports writing profiles stay behind the flag (§4, §7); renaming is enabled for templates *and*
all their event copies, after a confirmation (§6a); the split address stays stored and `adresa` becomes calculated,
no membership merge (§8); calculated fields build on today's composite fields; up to 6 guardian slots.

## 1. Principles

1. **One resolver.** Every place that turns a key into a value (documents, e-mails, lists, template check, import
   targets, the field card) goes through one function. Today that role is split between `resolveVariables`,
   `fieldTextValues`, `EVENT_KEYS` in `template-check.ts` and `VARIABLES_BY_PURPOSE` in `email-template-preview.ts`.
2. **Additive until the end.** Phases 0–6 only add tables, columns, enum values and screens. With the organization
   flag off, every existing code path behaves exactly as today. Old keys keep working (aliases), nothing is deleted.
3. **Map onto the four layers**, don't replace them: template (organization) → event copy → profile → registration.
4. **Everything reversible.** Every manager action writes a change-log record with before/after; imports record
   their writes so a whole import can be undone (the prototype's "Undo last change", made durable).

## 2. Where it lives (routes, components, API)

The manager is organization-wide with an **event switcher** (event-scoped things — event variables, per-event
required, imports, documents — follow the selected event). Route: `/fields` (top navigation, admins only,
visible only when the organization flag `fields_manager` is on). Tabs are sub-routes so links and the back button work.

| Prototype screen | Route | Main components (new) | API (new unless noted) |
|---|---|---|---|
| 01–03 Overview (sources → fields → uses; selection lights a path; calculated deps orange dashed; sources/uses pinned) | `/fields?event=…` | `FieldsOverview` (3 columns, SVG bezier layer, sticky side columns), `FieldCard` | `GET /api/fields/graph?event=` → `{ sources: syncs, fields: registry, uses: surfaces + documents + portal, edges }` |
| 04–05 Fields list + editor (label, key + rename, type cards, section, portal rule, required, used-in ticks, value counts, documents using it, aliases, delete/merge) | `/fields/list?event=&key=` | `FieldsList` (by section + event variables + search), `FieldEditor`, `TypePicker`, `RenameDialog` | `GET /api/fields` (registry), `POST /api/fields`, `PATCH /api/fields/[key]`, `POST /api/fields/[key]/rename`, `GET /api/fields/[key]/usage` (counts, documents, configs, syncs) |
| 06 New calculated field (join with separator, free text, age from date, if-then-else, built-ins; ordered chips, preview for a sample person) | same, editor in calculated mode | `CalculatedEditor`, `SeparatorPicker`, `CalcPreview` | `POST /api/fields/preview` (computes for an invented or chosen participant, never stores) |
| 07 Guardians (slots 1–6, properties, keys `guardianN_prop`, old keys as aliases of guardian 1) | `/fields/list?group=guardians` | `GuardianSettings` | `GET/PATCH /api/fields/guardians` |
| 08 Event variable (value per event, usage in documents, rename, delete) | `/fields/list?var=…&event=` | `EventVariableEditor` | `GET/POST /api/events/[id]/variables`, `PATCH/DELETE /api/events/[id]/variables/[key]` |
| 09–16 Import (source → connect → values → people → existing values & schedule) | `/fields/import?event=` (replaces the import page only when the flag is on; `/events/[id]/participants/import` stays) | `ImportWizard`, `ColumnMapper` (bezier, two independently scrolling lists, fixed-height panel), `NewFieldFromColumn`, `ValueTranslator` (≤3 context rows per value, hover = whole row), `PeopleMatcher` (Details, "merge into" any person, guardians found), `ExistingValues` (all → category → person → value; most specific wins), `ScheduleChoice` | `POST /api/events/[id]/imports/read` (sheet / CSV → table), `POST …/imports/plan` (dry run → plan), `POST …/imports/apply` (writes + `ImportRun`), `POST …/imports/[runId]/undo`; saved connection = existing `Event.participantSyncs` extended (§9) |
| 17 Where it is used (matrix; section, required, used-in, portal rule editable in place) | `/fields/usage?event=` | `UsageMatrix` | `PATCH /api/fields/[key]` (template props), `PATCH /api/events/[id]/participant-fields/[fieldId]` (existing; per-event required, surfaces) |
| 18–19 Documents (template with coloured variables, variable panel, pending Google Docs requests, Save = one batchUpdate, shared-template warning, pending counter) | `/fields/documents?event=&doc=` | `TemplateViewer` (renders the Doc's paragraphs from `documents.get`), `VariablePanel`, `PendingEdits` | `GET /api/events/[id]/documents/[docTypeId]/template` (paragraphs + classified variables), `POST …/edits` (queue), `DELETE …/edits/[id]`, `POST …/edits/save` |
| 20 Duplicates + merge modes (one by one / all; alias vs change directly) | `/fields/list?panel=duplicates` | `DuplicatesPanel` | `GET /api/fields/duplicates` (suggested groups, stored value counts), `POST /api/fields/merge` |
| 21 Data (per child guardians, "receives e-mail", calculated contact e-mail) | `/fields/data?event=` (read view + guardian edit) | `PeopleData` | existing child/participant APIs; `PATCH` guardian `receivesCommunications` (exists on the models) |
| "Field details card wherever a field is used" | everywhere (roster headers, health, mail, documents list, portal admin) | `FieldCard` popover + `useFieldCard(key)` | `GET /api/fields/[key]/card?event=` |

`FieldCard` is the one component every module embeds: label, key, type, section, where stored (profile /
registration / calculated / event variable), value counts, surfaces, documents using it, aliases, portal rule,
required (event value + organization default), and "Open in Fields Manager". With the flag off it isn't rendered.

## 3. Data model (Prisma diff, not run)

All additive. New enum values are `ALTER TYPE … ADD VALUE` (cannot be removed later without a rewrite, so they are
added only when the phase needs them).

```prisma
enum ParticipantFieldType {
  text
  number
  date
  boolean
  select
  image
  composite        // kept: legacy calculated (join / free text), read forever
  // added (phase 0):
  longtext
  multi            // several choices
  consent
  email
  phone
  calculated       // new calculated model, options = CalcSpec (§5)
  // `address` deliberately NOT added in v1 — see §8 and Q5
}

model Organization {
  // ...
  features String[] @default([]) @map("features")   // "fields_manager" = the per-organization flag
  guardianSlots Int @default(2) @map("guardian_slots") // 1..6, how many guardian slots imports and documents offer
  guardianProps Json? @map("guardian_props")          // extra guardian properties beyond the 5 fixed ones
}

model ParticipantFieldTemplate {
  // ...
  storage   FieldStorage @default(profile)   // decision A, §7. Default = today's behaviour for templates
  section   String?      @map("section")     // basic | health | upbringing | other | consent (UI grouping only)
}

enum FieldStorage { profile event }

model ChildGuardian       { /* ... */ position Int? @map("position")  extra Json? }
model ParticipantGuardian { /* ... */ position Int? @map("position")  extra Json? }
// position = slot (1..6); null = legacy row, ordered by id as today. extra = custom guardian properties.

model FieldAlias {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  alias          String                       // the old key, e.g. "alergie"
  targetKind     AliasTarget @map("target_kind") // field | guardian | event_variable
  targetKey      String   @map("target_key")  // canonical key, e.g. "allergies" or "guardian1_name"
  reason         String                       // rename | merge | legacy
  createdById    String?  @map("created_by_id")
  createdAt      DateTime @default(now()) @map("created_at")
  @@unique([organizationId, alias])
  @@index([organizationId, targetKey])
  @@map("field_aliases")
}
enum AliasTarget { field guardian event_variable }

model EventVariable {             // free variables only; linked/calculated ones are code (§4)
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  eventId        String?  @map("event_id")   // null = organization-level value (e.g. org contact phone)
  key            String
  label          String
  value          String   @default("")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@unique([organizationId, eventId, key])
  @@map("event_variables")
}

model SyncReviewItem {            // review queue for automatic syncs (§10)
  id          String   @id @default(uuid())
  eventId     String   @map("event_id")
  syncId      String   @map("sync_id")      // ParticipantSync.id inside Event.participantSyncs
  rowKey      String   @map("row_key")
  kind        String                         // possible_match | difference | unmatched | guardian_conflict | bad_value
  payload     Json                           // sheet row, proposed person, field diffs — invented in tests
  status      String   @default("pending")   // pending | applied | dismissed
  resolvedById String? @map("resolved_by_id")
  resolvedAt  DateTime? @map("resolved_at")
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([eventId, syncId, rowKey, kind])
  @@map("sync_review_items")
}

model ImportRun {                 // durable undo for one import or one sync run
  id        String   @id @default(uuid())
  eventId   String   @map("event_id")
  syncId    String?  @map("sync_id")
  writes    Json                               // [{ table, id, key, before, after }]
  createdById String? @map("created_by_id")
  createdAt DateTime @default(now()) @map("created_at")
  undoneAt  DateTime? @map("undone_at")
  @@map("import_runs")
}

model DocumentEdit {              // pending Google Docs requests (§11)
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  googleDocId    String   @map("google_doc_id")
  request        Json                           // one Docs API request, e.g. replaceAllText
  reason         String                         // "rename alergie → allergies", "typed text → {{place}}"
  status         String   @default("pending")  // pending | saved | discarded | failed
  createdById    String?  @map("created_by_id")
  createdAt      DateTime @default(now()) @map("created_at")
  savedRevision  String?  @map("saved_revision")
  @@index([googleDocId, status])
  @@map("document_edits")
}

model FieldChangeLog {            // every manager action, with before/after, for undo and audit
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  action         String                         // create | edit | rename | merge | delete | guardians | variable
  before         Json?
  after          Json?
  byId           String?  @map("by_id")
  at             DateTime @default(now())
  undoneAt       DateTime? @map("undone_at")
  @@index([organizationId, at])
  @@map("field_change_log")
}
```

Not changed: `Child.fieldValues` and `Participant.customFieldValues` stay `Json` maps of **strings**. New types are
encoded as strings so every existing reader keeps working: `multi` = items joined with `\n`; `consent` = `"true"` /
`"false"` plus a sibling key `<key>__at` (ISO date) — keys containing `__` are reserved and ignored by lists; `email`,
`phone` = normalised text (phone `+420 999 123 456`).

## 4. The resolver

One module, `src/lib/field-resolver.ts`, replaces the hand-kept lists. It has two parts:

**Registry** (what keys exist, for the current organization + event): event variables (linked, calculated, free),
guardian slot keys, fields (event copies, templates), aliases. Built once per request, cached per event.

```ts
type Resolved =
  | { kind: "event_variable"; key: string; canonical: string; value: string; viaAlias: boolean }
  | { kind: "guardian"; key: string; canonical: string; slot: number; prop: string; value: string; viaAlias: boolean }
  | { kind: "field"; key: string; canonical: string; field: FieldDef; storedIn: "registration" | "profile"; value: string; viaAlias: boolean }
  | { kind: "calculated"; key: string; canonical: string; field: FieldDef; deps: string[]; value: string; viaAlias: boolean }
  | { kind: "image"; key: string; canonical: string; image: Buffer | null }          // {{picture}}
  | { kind: "off"; key: string; canonical: string; field: FieldDef }                 // exists, not on this surface
  | { kind: "unresolved"; key: string };

resolveKey(key, ctx: { registry; participant?; profile?; event; surface: Surface }): Resolved
resolveAll(keys, ctx): Record<string, Resolved>   // documents: all placeholders of a template at once
```

Order (first hit wins): 1. event variable by key; 2. guardian key `guardian<N>_<prop>` (N ≤ slots); 3. field by key;
4. alias → canonical, then 1–3 with `viaAlias: true`; 5. calculated fields evaluate their dependencies through the
same function (cycle guard: a key already on the stack resolves to `""` and is reported; depth limit 8); 6. otherwise
`unresolved`. Legacy guardian keys (`zast_jmeno`, `zak_zast_jmeno`, `vztah`, `zast_telefon`) are seeded as aliases of
`guardian1_*` (`reason: legacy`), so the fixed rows keep working and the old resolver code can be retired later.

**Reading a field value (decision A + consent):** registration value for this event if non-empty; else, for
`storage = profile` fields of a linked participant, the profile value. This fallback is **new behaviour** (today
documents read the registration only), so it runs only when the organization flag is on (Q11).

**Behind the flag:** `resolveVariables` and `template-check` call the resolver when the flag is on, else today's
code. Phase 1 proves both produce identical output on golden documents (`plan.md`).

## 5. Calculated fields

New fields use `fieldType = calculated` with `options: CalcSpec`. Old `composite` fields are read as
`{ kind: "join" | "template" }` by the same evaluator, so nothing migrates.

```ts
type CalcSpec =
  | { kind: "join"; parts: string[]; separator: string }        // ordered keys; separator presets: " ", ", ", "; ", "/", " / ", " - ", " | ", "", "\n", custom
  | { kind: "template"; text: string }                           // free text with {{keys}}
  | { kind: "age"; source: string; asOf: "event_start" | "today" | { date: string } }
  | { kind: "if"; source: string; test: "filled" | "yes" | { equals: string }; then: string; else: string }
  | { kind: "builtin"; id: "full_name" | "contact_email" | "price" | "variable_symbol" | "payment_qr" | "membership_status" | "price_category" | "details_status" };
```

Rules (decision 4): never stored per person, never an import target (`isWritableField` already excludes them), shown
dashed everywhere, dependencies stored implicitly (derived from the spec) so the overview can draw the orange
dashed lines. The 7 computed fixed fields map to `builtin` ids; their rows stay `kind: computed` in the DB.

## 6. Aliases

- Created by rename (alias mode, the default), merge (alias mode), and seeded `legacy` aliases for guardian keys.
- **Uniqueness, per organization:** an alias may not equal any live field key, template key, event-variable key,
  guardian slot key, or another alias. Creating a field or variable whose key equals an existing alias is refused
  with "already used as the old name of X — rename X back or remove the alias first".
- Resolution is one hop: alias → canonical. A rename of a field that has aliases repoints them (no chains).
- Removing an alias is only possible when nothing uses it: no Doc template, saved column config, saved sync mapping
  or e-mail template contains it (the usage check of §2). Phase 7 offers "convert to direct" to get there.
- **Import-target aliases:** a few keys read as one thing and import as another. `Email` reads as the calculated
  contact e-mail but, as an import target, means `guardian1_email` (exactly what the importer does today via
  `guardianProp: "email"`). The registry keeps a small `importTargetOf(key)` map for these; the 4 saved connections keep
  working without being rewritten.
- Saved configs (`participantsListColumns`, `documentsListColumns`, `healthListColumns`, `exportColumns`,
  `participantLayout`, `healthNotes`, `participantSyncs[].mapping`) resolve keys through aliases when read; "change
  directly" rewrites them in the same transaction.

## 6a. Renaming (decided: enabled, with confirmation)

Renaming a field key in the manager renames the organization template **and every event copy** (fixing today's
problem that a template rename orphans its event copies, findings §4), in one transaction:
1. **Preview** (`GET /api/fields/[key]/rename-preview?to=`): number of events whose copy is renamed, stored values to
   move (profiles + registrations), saved column configs and sync mappings that mention the key, Doc templates and
   e-mail templates that contain `{{old}}`, and the alias that will be created.
2. **Confirmation dialog** showing that preview, the mode (keep the old key as an alias — default — or change
   directly), and a typed confirmation of the new key when more than one event or any stored value is affected.
3. **Apply:** template + event copies renamed; values moved in `Child.fieldValues` and `Participant.customFieldValues`;
   composite/calculated parts updated (as the event rename does today); alias created (alias mode) or configs/mappings
   rewritten and `DocumentEdit` rows queued (direct mode); one `FieldChangeLog` row with the full before/after → undo.
4. Refused when the new key is used by anything (field, template, event variable, guardian key or alias — §6).

Event-only fields (no template) rename the same way within their event.

## 7. Decision A — write targets in one function

As decided, adapted to the code (findings §3): the deciding property is the template's new `storage`
(`profile` default = today; `event` = registration only), not `level`.

```ts
// src/lib/field-write-targets.ts — the only place that decides where a value goes
writeTargets(field, ctx: { source: "import" | "portal" | "admin" | "public_form"; participantLinked: boolean; override?: "profile_and_registration" | "registration_only" }):
  { registration: boolean; profile: "write" | "propose" | "no" }
```

- Event-only field → registration only.
- Template with `storage = event` (e.g. t-shirt size) → registration only.
- Template with `storage = profile` → registration + profile; from the **portal** the profile write follows
  `portalAccess` (edit = write, approval = `ChildChange` proposal, read/hidden = no) exactly as `routeAnswers` does
  today; from **admin/import** = write (an import's per-run override can switch to registration only).
- `routeAnswers` becomes a caller of `writeTargets` (same results for every existing field because all templates
  default to `profile`).
- **Imports start writing profiles** only through this function and only with the flag on (today they never do).

**Consent** (decision 1): a `consent` field is a template with `storage = profile`. The registration records what was
agreed for that event (`key` + `key__at`), the profile holds the standing value. Documents and lists of an event read
the registration value; if empty, the profile's standing value (§4 fallback). Withdrawing consent on the profile does
not rewrite past registrations (they record what was agreed then) — Q12.

## 8. Decision B — required per event

`EventParticipantField.requiredOnRegistration` is the per-event value (exists). Changes:
- Usage matrix (screen 17) edits it for the selected event; the field card shows the organization default
  (`ParticipantFieldTemplate.requiredInRegistration`) beside it with "set as default".
- New events copy the default: `createEventWithDefaults` and `syncParticipantFieldsForEvent` set
  `requiredOnRegistration = template.requiredInRegistration` — **only for organizations with the flag on** (a
  one-line change each, but it changes what new events ask, so it is gated).
- The organization flag keeps its second meaning (public membership form, "missing" status) unchanged (Q9).

**Address (screen 20 / Q5).** The prototype merges the split address into a structured `adresa`. The code reads the
split keys from profiles (adults, travel orders) and portal users fill the split keys. This design keeps the **three
split fields as the stored truth** and makes `adresa` a **calculated join** (`adresa_ulice_cp, adresa_psc adresa_mesto`)
so old templates print the right address. No `address` type in v1.

## 9. Import (screens 09–16) on top of the existing sync

The wizard is a new front end over the existing pure planner, extended — not a second engine:
- **Source:** saved connections (existing `participantSyncs`), a linked Google Sheet (existing `readSyncSheet`), or
  pasted CSV / uploaded file (new, parsed client-side into the same `Table`).
- **Connect:** mapping targets become resolver keys: field keys, `guardian<N>_<prop>`, `__fullname` (split), `ignore`.
  Guardians move from "pair by position" to explicit slots (old mappings are read as slot = position).
- **Values:** new `valueMap: Record<header, Record<sheetValue, storedValue>>` on the connection (choice, yes/no,
  consent), remembered for next year.
- **People:** existing `matchBy` + new per-row `mergeInto` overrides (any person, typo case); guardians matched by
  e-mail.
- **Existing values:** new `policy: { all, byCategory, byPerson, byCell }` replacing `onMatch` (old `fill` =
  `all: keep`, `overwrite` = `all: replace`).
- **Apply:** writes go through `writeTargets`; every write is recorded in `ImportRun` → "undo this import".
- **Schedule:** existing `autoSync` + `everyHours`; 30 minutes would need a second Cloud Scheduler job or a
  `*/30` schedule for `participant-sync` (Q13).

## 10. Review queue for automatic syncs

An automatic run can't ask, so anything uncertain is queued instead of written: possible matches (same name,
different birth date; near names), differences under a "keep" policy that changed since the last run, unmatched rows
with `onNew = report`, guardian conflicts (same e-mail on two children, more guardians than slots), values with no
translation. One `SyncReviewItem` per row and kind, upserted by `(event, sync, rowKey, kind)` so re-runs don't
duplicate. **Any administrator of the event** can resolve (decision 3): apply (writes through `writeTargets`, recorded
in `ImportRun`), dismiss, or "always do this" (updates the connection's rules). A counter shows on the event and in
the manager; the existing `lastSync` summary stays as the run report.

## 11. Google Docs edit flow (screens 18–19)

1. **Read:** `documents.get` (all tabs, headers, footers, tables — reuse `template-check`'s walkers) → paragraphs with
   start/end indexes + `revisionId`. Classify every `{{…}}` through the resolver: green current, amber alias, blue
   event variable, red unresolved; amber also for typed text equal to an event variable's value (e.g. the place).
2. **Queue:** each edit becomes a `DocumentEdit` row (so "change directly" merges from other screens appear as pending
   too): renames = `replaceAllText {{old}} → {{new}}` (matchCase); typed text → variable =
   `replaceAllText "Typed text" → {{key}}` when the text is unique in the doc, else a ranged
   `deleteContentRange` + `insertText` computed from the fresh read.
3. **Save:** re-read the doc; if `revisionId` differs from the one shown, re-plan ranged edits from the new read
   (replaceAllText edits are position-free). Send **one** `batchUpdate` with
   `writeControl: { requiredRevisionId }`; on a revision conflict, re-read once and retry, else report.
   Ranged edits are sent in descending index order.
4. **Split placeholders:** `replaceAllText` matches text inside one paragraph regardless of formatting runs
   (to verify on staging, plan phase 6); a placeholder broken across paragraphs, or with spaces inside the braces, is
   shown red with "fix in Google Docs" — the manager never edits text it can't locate exactly.
5. **Shared templates:** a Doc used by document types of more than one event shows the warning; "save as a copy for
   this event" = `files.copy` into the event's Drive folder, repoint only this event's document type
   (`EventListItem.data.templateGoogleDocId`), then apply the edits to the copy.
6. The Drive identity is the event's existing one (`resolveDriveAuth`); a read-only template gives the existing
   `read_only_access` error.

## 12. Merge modes (screen 20)

For a group `old keys → target`:
1. Snapshot (`FieldChangeLog.before` = templates, event copies, affected values, configs).
2. Move values: for every profile and registration, `target` empty → take the old value; both filled and different →
   keep `target`, record the old value in the log (and list it on the result screen for review).
3. **Alias mode (default):** old keys become aliases of the target; old fields set `active = false` (not deleted).
   Documents, syncs and configs keep working untouched.
4. **Change directly:** additionally rewrite saved configs and sync mappings in the same transaction and queue
   `DocumentEdit` rows for every template using an old key (they wait for Save in Documents).
5. Phase 7 alone may delete inactive fields — after the snapshot and with an undo record.

## 13. What the flag gates

Organization flag `fields_manager` off ⇒ no `/fields` route, no `FieldCard`, resolver not called, no profile writes
from imports, no profile fallback in documents, no required copy into new events, no review queue. The new tables are
simply empty. Turning it off again returns every flow to today's code path (data written meanwhile stays valid
because values remain strings in the same maps).
