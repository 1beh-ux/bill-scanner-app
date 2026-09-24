# Planning Helper Module — Build Summary

Status: **built and shipped** (commits `71ea6e0`..`f4d31ef`, deployed through revision
`bill-scanner-app-00044-5pg`). Compares the actual implementation against
`planning-helper-module-design.md`. Steps 1–8 of the design's build order were built
as planned. After that the module grew in several rounds of real use: import, richer
exports, multiple categories, library/template sync and undo. Those changes are the
main drift, and each is listed below with the reason.

---

## Schema

| Design | Built | Notes |
|---|---|---|
| `PlanDay` / `PlanWindow` / `PlanSlot` / `PlanBlock` / `PlanActivity` | ✅ | As designed. Slot start/end times are never stored; they're computed (`planning-engine.ts`). |
| One `primaryCategoryId` + `secondaryCategoryId` per block/activity | **Changed** → `categories` JSON `[{categoryId, minutes}]` | User need: one activity spanning categories (Mikrosimulace = Teorie 10 + Praxe 20). Migration `plan_multi_categories` converted the existing rows. It was a JSON column rather than a join table because every move/copy copies it wholesale, and an unknown id (a deleted category) is simply ignored. |
| `PlanBlock.groupNames` (phase 2) | ✅ `text[]` | Values come from `Participant.groupName`; there's no group table (decision 5). |
| `ModuleKey.planning`, `ListTemplateKind` `plan_*` | ✅ | The `plan_activity` kind is org-only (base library) and is excluded from the event-creation copy. |
| — | **Added** `Event.planningSettings` JSON | Holds saved import sheet connections, the Drive export sheet id, event display settings (cards, undo depth) and the Google Sheet design. |
| — | **Added** `User.uiPrefs` JSON | Holds only the personal library-panel width now. The card and Sheet settings started here per user, then moved to the event at the user's request. |

Migrations: `add_planning_module_foundation`, `register_planning_module` (split out
because Postgres won't use a new enum value in the transaction that added it),
`add_plan_block_groups`, `add_event_planning_settings`, `add_user_ui_prefs`,
`plan_multi_categories`.

## Core logic: one pure source, reused everywhere

- `planning-engine.ts`:
  - computed times and window capacity/free/overflow;
  - `categoryMinutes()`, the split rule: no minutes = whole duration; entered minutes count as entered, scaled down only if they exceed the block; unminuted categories share the rest; resizing does not rescale;
  - `summarize()`: category coverage vs target, with main-category % taken over the **analysed time** only (categories marked "Počítat do analýzy" can be switched off, e.g. breakfast);
  - conflicts for leader, location and group;
  - the split color mark (`mainCategorySegments`).
- `planning-moves.ts` — `applyOp()`: every structural edit (move/copy of a slot or branch to a gap or onto a slot, insert, resize, delete). The board applies it optimistically, and `POST …/planning/ops` applies the **same** function to the stored plan, then `persistPlanDiff`. This collapses about 16 move/copy variants of the Apps Script tool into one place.
- `planning-export.ts` → `scheduleDays` / `scheduleRows`: one structured view that feeds CSV, PDF, print and the Google Sheet.
- `planning-sheet.ts` → `buildSheetModel()`: one grid model that drives both the Sheets writer and the settings preview.
- `planning-import.ts` (pure parsing and layout) + `planning-import-run.ts` (server): the preview is a dry run of the real import.

## Screens

| Design | Built | Notes |
|---|---|---|
| Board: library / day plan / summary | ✅ `/events/[id]/planning` | Library width resizable (per user); library and summary sticky. |
| Drag & drop replaces buttons | ✅ `@dnd-kit/core` | Gap = new slot, onto a slot = parallel, Alt/Ctrl = copy, bottom edge = resize (5-minute snap), hovering a day tab switches days mid-drag. Collapsible windows; a window's header also accepts drops. |
| Block side panel | ✅ `BlockEditor` | Single editable name (the "vlastní název" override dropped at the user's request) with "move selected text to description"; category/minute editor; leader, location, groups; **move/copy** by day + position (the same targets as DnD); **library sync**, i.e. update the library activity, optionally the other N occurrences too, or save as new. Also doubles as the **"+ Nová" create form** (save to library and/or place in the plan). |
| Days | ✅ | "+ den": copy of previous day / template / copy of the current day **including its program** / empty. Clicking the open tab edits it (name, date, windows, save as template, delete). Days sort by date, which replaced a separate reorder control. |
| Activity library | ✅ `/planning/activities` | Import from the base library or another event. Template status badges (Ze šablony / Upraveno / Jen v této akci); admins can push to org templates per row or for a selection. |
| Event settings → Plánování | ✅ | Main/secondary category lists shown separately, plus locations, leaders (with color), day templates, **plan display** (card fields, description length, undo depth) and **Google Sheet design** with a live preview. |
| Undo | **Added** | Snapshot before each board change; "↶ Zpět" / Ctrl+Z restores it through the `restore` op, validated server-side. Day/window edits clear the history, and it lives in the page only. |

## Import (not in the original design; added from real use)

`/planning/import` covers the schedule, activity library, leaders, locations and
categories, from a pasted table (tab/`;`/`,`, CSV quoting) or a Google Sheet tab.
Columns are mapped from Czech/English header guesses, and the mapping is saved per
import target. For the schedule, rows are laid out into windows: a shared start time
means parallel activities, back-to-back rows chain into one window, a gap starts a
new window, and overlapping rows get a parallel window. You choose per import
whether to replace or add to existing days, and a day whose rows all fail is never
wiped. Category cells accept minutes ("Teorie 10, Praxe 20").

## Export

| Design | Built |
|---|---|
| Print view + CSV | ✅ Print preview shows the exact PDF HTML; filters for day, leader and group. |
| — | **Added** PDF via the PDF service (A4 landscape, parallel activities side by side, split color mark). |
| Sheets export "deferred" | **Built**, then designed: title, frozen header, merged day and parallel-time cells, minutes per analysed main category, tinted organisation rows, leader-colored cells. Style is per event. Written as a single `batchUpdate`; the sheet is recreated if it was deleted. |

## Outside the module (done in the same rounds)

- `<main>` is now the desktop scroll container. Before this, every `position: sticky` in the app was inert (event settings nav, bill detail header, planning panels).
- The mobile menu drawer scrolls, and sidebar items no longer shrink into the event picker.
- Participant lists (central, Health, Mail) show cards on small screens, like the bills list.

## Verification

- `npx tsx src/lib/planning.check.ts`: engine, moves, split rule, color segments, conflicts, sheet model, settings sanitizers.
- `npx tsx src/lib/planning-import.check.ts`: table parsing, header guessing, time/date/duration formats, category cells, layout.
- `scripts/verify-planning-db.ts`: runs against a local throwaway Postgres and refuses any non-local URL. Covers:
  - persisted result == `applyOp` for every op;
  - imports for all targets (dry run == real run, replace idempotent, append);
  - day copy, export rows, PDF layout;
  - library ↔ template round trip;
  - undo restore (exact, stale refused, foreign references dropped).
- The `plan_multi_categories` migration was verified against old-format rows before deploy.

## Known limits / follow-ups

- **Concurrent editors:** last write wins. A restore reverts the whole board to the snapshot, including another person's edits made in between.
- **Undo history** is lost on reload, and day/window edits clear it.
- **Mobile:** the library stacks above the plan (no bottom drawer). Drag on touch uses a long press.
- **Day templates** can't be applied to an existing day (edit its windows instead).
- **Deploy lesson:** migrations run before the ~5 min build. The destructive `plan_multi_categories` migration caused ~3 minutes of 500s and 2 lost panel saves on the old revision. Use expand/contract for future column drops.
- **Not yet confirmed in production:** the formatted Google Sheet write (only the model and preview are tested) and undo in the browser.
