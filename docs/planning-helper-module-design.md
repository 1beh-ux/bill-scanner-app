# Planning Helper Module — Design Draft v1

Status: built and shipped (steps 1–9) — see planning-helper-module-build-summary.md for what changed since this design. Fourth module on the event platform, after Bills, Health and
Mail Helper. It is ported from a working Google Apps Script tool ("Event Planner MVP")
that kept its data in Sheets tabs (Events, Days, Windows, Activities, ScheduleSlots,
ScheduleBlocks, Categories, People, Locations, App_Settings, Export_Schedule).

Goal: carry over the planning model as it is (days → windows → slots → parallel
branches, with times worked out from order and duration). Swap the button-and-modal
editing for drag & drop. Plug it into the platform like any other module: scoped to an
event, gated by `event_modules` plus `user_event_module_access`, and using the same
sidebar and settings patterns.

---

## What the old tool actually does (the model to keep)

- **Day** — a date in the event (label, theme, notes, order).
- **Window** — a named time range in a day, e.g. "Morning Program" 09:00–12:00.
  There are three effective kinds:
  - *flexible / full*: capacity = end − start; shows free and overflow.
  - *flexible / partial*: planned activities count, but capacity isn't enforced (evening).
  - *fixed*: locked, holds no slots (Lunch).
- **Slot** — an ordered position inside a window with a **duration**. Start and end are
  **never stored**. They are computed sequentially from the window start
  (`start = window.start + Σ previous durations`).
- **Block ("branch")** — what happens in a slot. A slot with two or more blocks is a
  **parallel** slot: same time, different groups. Each block has an activity (or a
  custom name), description, primary and secondary category, leader and location.
- **Activity library** — reusable activity templates (default duration, categories,
  default leader/location, description, repeatable flag). "Remaining only" mode hides
  non-repeatable activities that are already scheduled anywhere in the event.
- **Summary** (per day or per event) — capacity, used, free and overflow minutes;
  category coverage versus target % (a parallel slot counts each distinct category
  once, for the full slot duration); leader and location utilization (each branch
  counts the full duration); overflow warnings.
- **Duplicate day** — windows only, or windows plus blocks.
- **Export** — a flat row per block to a sheet.

## Confirmed decisions (from the request)

1. **A module, not a separate app.** New `ModuleKey` value `planning`. It is gated
   exactly like `mail`: enabled per event, with per-user grants (admins are
   superusers). It gets its own sidebar group.
2. **Event-based.** The old tool's own `Events` sheet goes away; everything hangs off
   the platform `Event`. The old `default_day_start/end` come from the default windows
   instead.
3. **Leaders are a separate list.** They are not `Participant` and not `User`. Each
   event keeps its own leaders list (name, role, phone, notes).
4. **Drag & drop replaces buttons.** No ↑/↓, no −10/−5/+5/+10, and no "select target"
   dropdowns with Move into, Copy into, Move after or Copy after (see *Interactions*).
5. **Current app design.** Tailwind with the existing components, Czech UI through
   `i18n`, and the same page shell as the Health and Mail pages.

---

## Reuse vs. new

| Old concept | New home | Why |
|---|---|---|
| Events | existing `Event` | platform entity |
| Categories (name, group, color, target %) | `EventListItem` kind `plan_category`, `data: {group, color, targetPercent}` | the existing org-template → per-event list mechanism (`ListTemplate` / `EventListItem` / `ListTemplateAdmin`), same as meds, slots, situations and documents. Categories repeat across camps, so the org-level default is worth having |
| Locations (name, capacity, notes) | `EventListItem` kind `plan_location`, `data: {capacity, notes}` | same mechanism, same admin UI |
| People / leaders | `EventListItem` kind `plan_leader`, `data: {role, phone, notes}` | a separate list, per event. It still gets an org template for free (regular leaders) but doesn't have to use it |
| Activities | **new** `PlanActivity` table (per event) + org base library as `ListTemplate` kind `plan_activity` | too many typed fields and foreign keys for a JSON `data` blob at event level. Base library + "copy from another event" cover year-to-year reuse |
| (new) Day templates | `ListTemplate` / `EventListItem` kind `plan_day_template` | window sets for "add day from template" |
| Days / Windows / Slots / Blocks | **new** `PlanDay`, `PlanWindow`, `PlanSlot`, `PlanBlock` | the core of the module |
| App_Settings | **dropped** (see below) | |
| Export_Schedule sheet | print view + CSV download | no sheet round trip needed |
| Access / nav / event settings tab | existing `module-access.ts`, `AppSidebar`, event settings tabs | |

`requireListItemAccess` in `src/lib/module-access.ts` needs one change: map the
`plan_*` kinds to the `planning` module (it currently maps `document` → mail and
everything else → health).

### Settings — what dies and why
- `duration_step_small/large`: gone, because duration is set by dragging the slot's
  bottom edge, snapped to 5 minutes. The edit panel still has a number input.
- `minimum_block_duration`: a constant of 5 minutes, the same as the snap.
- `library_mode`: a toggle in the library panel header, remembered per user in
  localStorage.
- `day_duplicate_mode`: a choice in the "Duplicate day" dialog.
- `show_leader_in_card` / `show_location_in_card`: a view toggle, localStorage.
- `default_new_block_position`: unnecessary, because a drop decides the position.

This means no settings table and no new `Event` columns.

---

## Schema (proposed)

```prisma
enum PlanWindowKind {
  flexible   // old flexible + full
  partial    // old flexible + partial
  fixed      // old fixed (locked, no slots)
}

model PlanDay {
  id        String    @id @default(uuid())
  eventId   String    @map("event_id")
  date      DateTime? @map("date") @db.Date
  label     String
  theme     String?
  notes     String?
  sortOrder Int       @map("sort_order")
  event     Event        @relation(fields: [eventId], references: [id])
  windows   PlanWindow[]
  @@index([eventId])
  @@map("plan_days")
}

model PlanWindow {
  id        String         @id @default(uuid())
  dayId     String         @map("day_id")
  name      String
  startMin  Int            @map("start_min")   // minutes from midnight
  endMin    Int            @map("end_min")
  kind      PlanWindowKind @default(flexible)
  color     String?
  notes     String?
  sortOrder Int            @map("sort_order")
  day       PlanDay    @relation(fields: [dayId], references: [id], onDelete: Cascade)
  slots     PlanSlot[]
  @@map("plan_windows")
}

model PlanSlot {
  id          String  @id @default(uuid())
  windowId    String  @map("window_id")
  durationMin Int     @map("duration_min")
  position    Int
  notes       String?
  window      PlanWindow  @relation(fields: [windowId], references: [id], onDelete: Cascade)
  blocks      PlanBlock[]
  @@map("plan_slots")
}

model PlanBlock {
  id                  String  @id @default(uuid())
  slotId              String  @map("slot_id")
  branchOrder         Int     @map("branch_order")
  activityId          String? @map("activity_id")
  customName          String? @map("custom_name")
  description         String?
  primaryCategoryId   String? @map("primary_category_id")   // EventListItem plan_category
  secondaryCategoryId String? @map("secondary_category_id") // EventListItem plan_category
  leaderId            String? @map("leader_id")              // EventListItem plan_leader
  locationId          String? @map("location_id")            // EventListItem plan_location
  notes               String?
  slot     PlanSlot      @relation(fields: [slotId], references: [id], onDelete: Cascade)
  activity PlanActivity? @relation(fields: [activityId], references: [id], onDelete: SetNull)
  // + named relations to EventListItem for the four *_id fields, onDelete: SetNull
  @@map("plan_blocks")
}

model PlanActivity {
  id                  String  @id @default(uuid())
  eventId             String  @map("event_id")
  name                String
  defaultDurationMin  Int     @map("default_duration_min")
  description         String?
  primaryCategoryId   String? @map("primary_category_id")
  secondaryCategoryId String? @map("secondary_category_id")
  defaultLeaderId     String? @map("default_leader_id")
  defaultLocationId   String? @map("default_location_id")
  energyLevel         String? @map("energy_level")
  repeatable          Boolean @default(false)
  active              Boolean @default(true)
  event  Event       @relation(fields: [eventId], references: [id])
  blocks PlanBlock[]
  @@index([eventId])
  @@map("plan_activities")
}
```

Deliberate differences from the sheets:
- **No denormalized `day_id` / `window_id` on slots and blocks.** They are reached
  through the parent. Keeping those copies in sync was most of the old
  `moveSlot*` / `saveWindows*` code, and a source of drift.
- **No `is_parallel` column.** It is derived as `blocks.length > 1`.
- **No `is_locked` on blocks.** It was never read.
- **Times stored as minutes (Int).** Parsing Sheets date/number/string values was a
  large share of `Utils.gs`.
- **Foreign keys, not names.** The old activity stored `leader: "Tom"` and was
  resolved by name lookup.
- **Cascade deletes.** Deleting a day or window removes its children in the DB, which
  replaces the `delete*CascadeInternal_` functions.
- **Blocks take a snapshot of the activity when created** (name override, description,
  categories, leader, location), the same as today, so later library edits don't
  rewrite past plans. Changing a block's activity re-applies the defaults, also as
  today.

Migration: one `prisma migrate dev` (the pre-commit hook blocks schema changes without
it). It also does `INSERT INTO "modules" ("key","name") VALUES ('planning','Plánování')`,
the same as the mail foundation migration did.

---

## Computation — `src/lib/planning-engine.ts`

A port of `plannerengine.gs` as **pure TS functions over plain data**: no DB access and
no string time parsing. The page imports the same module to recompute instantly during
optimistic updates, and the server imports it for print and CSV export. That replaces
the separate client-side `recalcWindowSlotsLocal_` duplicate.

- `computeDay(day, windows, slots, blocks)` → per-slot start/end, per-window
  used/free/overflow with the kind rules above, and warnings.
- `summarize(computedDays, lists)` → category coverage versus target (a parallel slot
  counts each distinct category once), leader and location minutes. Day or event
  scope is simply one day versus all days.
- **New: conflict warnings.** The same leader or the same location in two blocks with
  overlapping computed times on the same day. This covers two parallel branches, and
  also two windows that overlap. The old tool had no conflict detection.
- It ships with one small `planning-engine.test.ts`-style self-check (the sequential
  timing, the parallel-category rule and the conflict rule).

---

## API — ~12 routes instead of ~45 functions

All routes live under `/api/events/[id]/planning/…` and all use
`requireModuleAccess(user, eventId, "planning")`.

| Route | Replaces |
|---|---|
| `GET planning` — whole event: days, windows, slots, blocks, activities, lists | `apiGetAppBootstrap`, `apiGetPlannerDay`, per-day preload loop |
| `POST/PATCH/DELETE planning/days[/dayId]` (+ reorder) | `apiSaveDays`, `apiCreateDay`, `apiDeleteDay` |
| `POST planning/days` `{source: "previous" \| "empty" \| {templateId}}` | `apiCreateDay`, `createDefaultWindowsForDay_` |
| `POST planning/days/[dayId]/duplicate` `{withBlocks}` | `apiDuplicateDay`, `…PreviousDay`, `…FirstDay` |
| `POST planning/days/[dayId]/save-template` `{name}` | (new) |
| `POST/PATCH/DELETE planning/windows[/windowId]` | `apiSaveWindows`, `apiUpdateWindowTimes` |
| `POST planning/slots` `{windowId, index, activityId? \| inline}` | `apiAddBlock`, `apiCreateActivityAndAddToWindow` |
| `PATCH planning/slots/[slotId]` `{durationMin?, notes?}` | `adjust/updateSlotDuration` |
| `POST planning/slots/[slotId]/move` `{target, copy}` | `moveSlotUp/Down/ToWindow/AfterSlot`, `copySlot`, `duplicateSlotAfterSlot`, `move/copyWholeSlotIntoSlot` |
| `DELETE planning/slots/[slotId]` | `apiDeleteSlot` |
| `PATCH planning/blocks/[blockId]` | `apiUpdateSlotItem` |
| `POST planning/blocks/[blockId]/move` `{target, copy}` | `moveSlotItem`, `move/copyBranchIntoSlot`, `move/copyBranchAfterSlot` |
| `POST planning/slots/[slotId]/blocks` (empty branch) / `DELETE planning/blocks/[blockId]` | `addSlotBranch`, `splitSlot`, `deleteSlotItem` |
| `GET/POST/PATCH planning/activities` (+ `import` from base library / another event) | Activities sheet |

**One target shape covers every move and copy:**
`target = { windowId, index }` (becomes its own slot at that position) **or**
`{ slotId }` (joins that slot as a parallel branch). With `copy: true` the source is
left in place. Moving the last branch out of a slot deletes the now-empty slot. Each
move runs in a single `prisma.$transaction` and renumbers positions and branch order
in the affected windows and slots.

Mutations return only `{ ok }` (plus new IDs on create). The client already holds the
optimistic state. On error it rolls back to the snapshot and shows a toast.

**Save model: dropped.** The old dirty-op queue, 30 s autosave, localStorage drafts,
"Save now" and "Discard local draft" existed because Apps Script round-trips took
seconds. Here every drop or edit is one fast request, applied optimistically, so there
is nothing to queue.

---

## UI

Route: `/events/[id]/planning`. Sidebar group "Plánování" with the items
**Plán** (the board) and **Knihovna aktivit** (the full library editor).
Categories, locations and leaders get a **"Plánování"** tab in event settings, backed
by `ListTemplateAdmin` with the three new kinds, plus org defaults on `/templates`.

### Board layout (desktop)
```
┌ Day tabs:  [Po 10.7.] [Út 11.7.] [St 12.7.] …  [+ den] [⧉ duplikovat] ─────────────┐
├──────────────┬───────────────────────────────────────────────┬──────────────────┤
│ Library      │ Morning Program   09:00–12:00   used 150/180   │ Summary Day/Event│
│ [search]     │ ┌────────────────────────────────┬─ 09:00 ┐    │ capacity/used/…  │
│ [x] remaining│ │ Archery (Tom · Field)          │ 60 min │    │ categories vs %  │
│              │ ├────────────────┬───────────────┼─ 10:00 ┤    │ leaders min      │
│ ▢ Archery 60 │ │ Game  (Anna)   │ Workshop      │ 30 min │    │ locations min    │
│ ▢ Break 15   │ └────────────────┴───────────────┴────────┘    │ ⚠ conflicts      │
│ ▢ Lecture 45 │ Lunch 12:00–13:00  (fixed)                     │ [Tisk] [CSV]     │
│ [+ nová]     │ Afternoon Program …                            │                  │
└──────────────┴───────────────────────────────────────────────┴──────────────────┘
```
- The height of a slot is proportional to its duration (with a minimum height), so the
  board reads as a timeline and resizing is visual.
- Each window shows a capacity band. Overflowing slots and windows turn red.
- Fixed windows are compact grey bars and cannot be dropped on.
- On narrow screens the panels stack (library becomes a bottom drawer), the same as the
  old 1100 px breakpoint.

### Interactions (drag & drop replaces the buttons)
| Old button(s) | New |
|---|---|
| Select window + "Add" on an activity | drag a library card into a window gap → new slot at that position |
| "Add branch" / split slot | drag a library card **onto** an existing slot → parallel branch |
| ↑ / ↓, "Move to window", "Move after selected" | drag the slot handle to any gap, in any window |
| "Move/Copy into selected" (whole slot → parallel) | drag a slot onto another slot |
| "Move/Copy branch as parallel / after selected" | drag a single branch onto a slot, or into a gap |
| Copy slot / copy variants | the same drags while holding **Alt/Ctrl** (a "+" cursor badge), or ⧉ on hover |
| −10/−5/+5/+10 | drag the bottom edge of a slot (snaps to 5 min, shows a live time tooltip) |
| Move to another day | hover a dragged item over a day tab for 0.5 s to switch days, then drop |
| Edit slot modal | click a block → side panel with activity, title, description, categories, leader, location and notes (autosaves on blur). The leader and location chips on the card stay as quick selects |
| Window time editor ±5/±10 | window header → inline `<input type="time">` start/end + kind select |
| Days/Windows manager modals | days: tabs are drag-reorderable, with rename/date/delete in a tab menu. Windows: "Upravit okna" per day (name, times, kind, drag to reorder) |
| Delete slot / branch | 🗑 on hover, with confirm |

Keyboard and touch: dnd-kit gives both pointer and keyboard sensors, so
drag-and-drop still works on tablets and without a mouse.

### Export
- **Tisk** — a print-CSS page `/events/[id]/planning/print?day=…|all&leader=…`, giving
  one day per page. A per-leader filter produces "my schedule" sheets.
- **CSV** — the same columns as the old `Export_Schedule`, generated server-side from
  the engine.
- Sheets export (like Mail's status export) is **deferred**. Add it if someone
  actually needs a live sheet.

---

## Dependency

**`@dnd-kit/core` + `@dnd-kit/sortable`** (new dependency). Native HTML5 DnD has no
touch support, no keyboard support and poor auto-scroll, and resize plus
cross-container sortable with parallel drop targets is well beyond "a few lines".
dnd-kit is small, has no other dependencies and is React-19-compatible. This is the
only new package.

---

## Integration touch points (hardcoded module lists to extend)

- `prisma/schema.prisma` `ModuleKey` + migration seed row
- `src/app/api/events/[id]/modules/route.ts`, `…/module-access/route.ts` `MANAGEABLE_MODULES`
- `src/app/api/events/[id]/route.ts`, `…/drive-identity/route.ts` `requireAnyModuleAccess` lists
- `src/app/api/events/route.ts` module filter
- `src/app/events/[id]/page.tsx` `ModuleKey` / `MODULE_KEYS` / tab slug map
- `src/components/participants/ParticipantFieldAdmin.tsx` `ModuleKey` type
- `src/components/AppSidebar.tsx` — `showPlanning` + nav group
- `src/lib/module-access.ts` `requireListItemAccess` kind → module
- `src/app/templates/page.tsx` — "Plánování" tab
- translations (cs/en) for all new keys

---

## Not ported (bugs or dead code in the original)

- Duplicate function definitions in `modals.js` (`copySlotFromModalUi_`,
  `removeSlotBranchFromModalUi_`), where the later definition silently wins.
- `moveBranchAfterSlot_` returns the plan computed *before* the source is deleted, so
  the result is stale.
- ID generation by scanning for the max ID, which races under concurrent users.
- The unused `moveWholeSlotFromModalUi_` / `apiMoveSlotToWindow` path (its modal input
  no longer exists).
- `migrateLegacyBlocksToSlots_` and the demo seeding, which are one-off sheet history.
- Silent day deletion from the Days manager (it cascaded with no confirm).

## Build status

- **Done (steps 1–7), deployed:** foundation, lists and activity library, engine
  (`src/lib/planning-engine.ts`), board with drag & drop, block side panel,
  day management, print and CSV.
- **Days:** "+ den" offers a copy of the previous day's windows, a template, a copy
  of the current day *including its program*, or an empty day. Clicking the open
  day's tab edits it (name, date, windows, save as template, delete). Days are
  ordered by date, so changing a date is how a day moves. There's no separate
  reorder control.
- **Blocks:** clicking a branch opens the side panel: activity (picking one refills
  its defaults), custom title, duration, categories, leader, location, description
  and notes. Saved via `PATCH …/planning/blocks/[blockId]`; references are
  validated against the event's own lists.
- **Export:** `/events/[id]/planning/print?day=&leader=` gives one page per day,
  with a per-leader schedule option. `…/planning/export` gives CSV with the same
  filters (semicolon-separated with a BOM, for Czech Excel). Both are built from
  `scheduleRows` (`src/lib/planning-export.ts`).
- All structural edits go through one pure `applyOp` (`src/lib/planning-moves.ts`).
  The board applies it optimistically, then `POST …/planning/ops` applies it again
  to the stored state and persists the diff (`persistPlanDiff`).
- Checks: `npx tsx src/lib/planning.check.ts` (engine and moves, pure) and
  `scripts/verify-planning-db.ts` (persistence, imports, day copy and export rows,
  against a local throwaway Postgres).
- **Next:** step 8, participant groups on blocks (`groupNames` from
  `Participant.groupName`, group conflicts, per-group print).
- **Known limits:** last write wins between concurrent editors; on narrow screens
  the library panel stacks above the plan (no bottom drawer); applying a template
  to an existing day isn't supported (edit its windows instead).

## Build order (proposed)

1. Schema + migration + module registration and gating (sidebar entry, empty page).
2. Lists: the `plan_category`, `plan_location`, `plan_leader` and `plan_day_template`
   kinds in settings and templates, the base `plan_activity` templates, plus the event
   activity library CRUD and import.
3. `planning-engine.ts` + self-check.
4. Read-only board (days, windows, slots and branches rendered with computed times and
   the summary panel).
5. DnD: library → gap/slot, slot move/copy, branch move/copy, resize, day-tab hover.
6. Block side panel, window editing, day management and duplicate.
7. Print + CSV.
8. Phase 2: participant groups on blocks (+ group conflicts, per-group print).
9. Build summary doc (`planning-helper-module-build-summary.md`) as for Mail.

## Decisions on the open questions (confirmed)

1. **Start fresh.** No import from the Apps Script spreadsheet.
2. **Activity library per event, with "copy from another event", plus an org base
   library** of common block types (Hra, Přestávka, Workshop, Přednáška, …). The base
   library is `ListTemplate` kind `plan_activity`, with
   `data: {defaultDurationMin, description, primaryCategoryName, secondaryCategoryName,
   energyLevel, repeatable}`. It is edited on `/templates` → "Plánování". It feeds the
   event library in two ways:
   - The library panel has a **"Základní"** (base) section. Dragging a base item onto
     the board creates the event `PlanActivity` on the fly (on first use) and then the
     block.
   - **"Přidat ze základní knihovny"** (add from the base library) and **"Kopírovat z
     jiné akce"** (copy from another event) do a bulk import into the event library.
   Categories are referenced by **name** (`primaryCategoryName` /
   `secondaryCategoryName`). Event categories copied from org templates keep the
   template name, so a base activity resolves to the event's category of the same
   name (case-insensitive). If there's no match, the field stays empty. Leader and
   location are never part of the base library, because they are event-specific.
   ("Copy from another event" re-resolves categories, leaders and locations by name
   the same way.)
3. **Leaders are names only.** `EventListItem` kind `plan_leader`, not linked to `User`.
4. **Day templates.** "+ den" (add day) opens a small menu:
   - **Kopie předchozího dne** (copy of the previous day; the default, windows only)
   - **Z šablony: …** (from a template), a list of day templates
   - **Prázdný den** (empty day)

   Day templates (e.g. "Běžný den", "Výletní den", "Příjezd", "Odjezd") are
   `ListTemplate` / `EventListItem` kind `plan_day_template`, with
   `data: {windows: [{name, startMin, endMin, kind, color}]}`. There are org defaults,
   a per-event copy and per-event custom ones, all through the existing mechanism.
   **"Uložit den jako šablonu"** (save day as template), in the day tab menu, creates
   an event-level template from the current day's windows. Templates carry windows
   only. Blocks move between days through "duplicate day" (with blocks) or DnD.
   Applying a template to an *existing* day is **deferred**, because it would have to
   decide what happens to slots in windows that disappear.
5. **Participant groups on blocks: yes, as phase 2** (after the core board works).
   Plan: `PlanBlock.groupNames String[]`, with values taken from the distinct
   `Participant.groupName` values of the event. That keeps it on the shared
   participant roster (see participants-as-shared-resource) without a new group
   entity. The board shows group chips on each branch. The engine's conflict check is
   written generically over (leader, location, group) from the start, so groups plug
   in without a rewrite. It would also enable a "schedule per group" print view.
   If groups ever need their own attributes (color, leader), promote them to a proper
   table then.
