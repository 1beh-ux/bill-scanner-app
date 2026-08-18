# Health Module — UI Flows, Screens & Copy (Draft v1)

Status: draft. Companion to `bill-scanner-v2-health-module-design.md` (schema,
access model, infrastructure) — this doc covers screens, navigation, and
representative UI text. Route paths assume the existing Next.js App Router
structure (`/events/[id]/...`, matching how `bills` and `import` are laid out today).

---

## Navigation & visibility

A "Zdraví" (Health) item appears in the event sidebar **only when both** are true:
the event has the module enabled (`event_modules`), and the signed-in user has a
grant for it (`user_event_module_access`). Same visibility logic will apply to Mail
Helper later — no special-casing per module.

---

## Screens

### 1. Participants list — `/events/[id]/health`

Entry point for the module. List of participants for the event, search by name.
"+ Přidat účastníka" opens an add form (name, group, the four structured note
fields, and a repeatable guardian block — name/email/relationship/receives
communications). Each row shows name, group, and light-touch indicators (e.g. a
dot if there are open/recent incidents) — nothing heavy, just enough to scan.
Clicking a row navigates to participant detail (a full page, not a modal — the
detail view already nests its own modals, and modal-in-modal is bad UX here). An
"Importovat účastníky" button opens Screen 1a.

### 1a. Participant import — `/events/[id]/health/participants/import`

Paste box that accepts tab-separated data copied straight from the org's
existing Google Sheet. On paste, the first row is treated as headers and
auto-matched to fields (name, group, allergies/meds/chronic/other notes, and
one guardian-email column — the source sheet has a single contact column,
email-only, so no guardian name comes through on import); a mapping row lets
the admin correct any mismatches. Below that, a preview table — one row per
participant, flagging anything missing a name or with a malformed email —
before a single "Importovat" commits the batch. A planned "Import z Google
Sheets" tab sits alongside this later (URL/ID input instead of pasting cells,
same mapping and preview step, sourced live from the Sheet) — not needed to
ship the first version, since paste already solves the immediate need with no
new Drive permissions to set up.

### 2. Participant detail — `/events/[id]/health/participants/[participantId]`

- Header: name, group, edit button (opens the same form as "add," pre-filled)
- Structured notes shown prominently at the top — allergies, meds, chronic issues,
  other notes, or "Bez zdravotních poznámek" if empty
- Guardians list with inline add/remove and a `receives_communications` toggle per
  guardian
- **Záznamy** (incident timeline): grouped exactly as in the source app — parent
  incidents newest-first, follow-ups indented and collapsible underneath. "+ Záznam"
  always starts a new top-level incident; each row has "Detail" and "+ Follow-up"
- **Odeslat souhrn rodičům** button — opens the single-send confirmation (see
  Screen 9)
- **Stáhnout PDF** button — generates the same summary PDF without sending, for
  when someone just wants a copy on hand

### 3. Incident form modal (new / edit / follow-up)

One shared component, three modes:

- Situation-template chip row (event's templates, falling back to org defaults)
  — tapping one bulk-fills category, summary, med, temp, and details
- Category select, temperature input, summary input, medication select (from
  `event_meds`, with a "jiné…" free-text fallback), details textarea
- Body map — tap front/back silhouette to place a marker
- Single photo upload (camera or file), client-side compressed before upload
- Save button label changes: "Uložit" / "Uložit follow-up"

Follow-up mode locks category, template, and body-map location (inherited,
greyed out) — same rule as the source app: a follow-up is a checkpoint on the
same situation, not a new one.

### 4. Incident detail modal

Read-only view of everything above, plus the "Detail" trigger flow: edit (opens
the form in edit mode, writes an `incident_updates` row) and "+ Follow-up."

### 5. Meds administration — `/events/[id]/health/meds`

Date picker (bounded to the event's date range) and slot selector — pulling
from the event's `event_slots` list, standard defaults but editable per event,
not hardcoded. Checklist
grouped by participant, tap to toggle given/not-given, optimistic UI, completed
participants sort to the bottom, progress counter at top. Tapping a participant's
name (not the checkbox) opens their structured notes as a quick safety check
before dispensing — carried over directly from the source app, it's a good habit
worth keeping exactly as-is.

### 6. Meds print — panel or modal from Screen 5

Same two report types as the source app: **plan** (flat list per slot) and
**grid** (weeks × days × participant+med checkboxes), in blank (paper backup) or
hybrid (pre-filled with actual given-status) mode. Difference from the source app:
this now goes through the headless-PDF render service rather than the browser
print dialog, so the output is a real downloadable/saveable file, not just a
print-formatted page.

### 7. Event Health settings — tab within `/events/[id]/settings`

- Module on/off for this event
- `event_meds` list — copied from `med_templates` at event creation, editable
  from here (add/rename/deactivate)
- `event_slots` list — same pattern (standard time slots, editable per event)
- `event_situation_templates` list — same pattern
- Email template override — optional; if left blank, the org default is used

Per-user module grants (Bills, Health, and Mail once it exists) now live in
their own shared **Přístup** (Access) tab within event settings, not bolted
onto Health specifically — one grid of admins × modules, a checkbox per cell.
That tab isn't owned by any one module; it's core event administration now
that Bills goes through the same grant system.

### 8. Org-wide Health admin

Alongside wherever `category_templates` gets managed today:

- **Med templates** — org default medication list
- **Situation templates** — key, button label, category, short description,
  default med, default temp, default details, active toggle
- **Email template (org default)** — subject/body editor for
  `parent_health_summary`, with a variable-insertion palette
  (`{{child_name}}`, `{{camp_name}}`, `{{date_range}}`, `{{sender_name}}`) and a
  live preview using dummy data before saving

### 9. Sending — two entry points, one underlying flow

**Single send** (from Participant Detail): confirmation dialog shows the resolved
recipient list (guardians with `receives_communications = true`), a rendered
subject preview, and a link to the PDF that will be attached, before the Send
button is live.

**Bulk send** (from the Participants List or Event Health Settings): "Odeslat
souhrny všem rodičům" — a table of participant × guardian × status
(pending/sent/failed), sends with per-recipient failure isolation, updates live
as each one completes.

**Send log** — a simple table (participant, guardian, sent_at, status, error if
failed) with a resend action on failures. Could live as a tab within Participant
Detail plus an event-wide rollup view.

### 10. PDF content (parent summary)

Structurally the same as the source app's `print_child`: header (camp name,
generated timestamp), participant info, structured notes block, body map with
numbered markers (F1, F2, B1…), and the threaded incident timeline with matching
codes. The HTML template carries over almost unchanged — it's the layout that
gets rendered server-side into a PDF now, rather than opened in a new tab for the
user to print manually.

---

## Representative copy (Czech — not exhaustive)

Full strings get finalized in the `translations` table at build time; these are
representative, not a complete set.

**Screen headers:** "Účastníci", "Záznamy", "Výdej léků", "Nastavení modulu Zdraví"

**Buttons:** "+ Přidat účastníka", "Importovat účastníky", "Importovat",
"+ Záznam", "+ Follow-up", "Odeslat souhrn rodičům", "Stáhnout PDF", "Odeslat
souhrny všem rodičům"

**Empty states:** "Bez zdravotních poznámek.", "Zatím žádné záznamy.", "Žádné
plánované léky pro tento slot."

**Default email template:**
- Subject: `Souhrn zdravotních záznamů – {{child_name}} – {{camp_name}}`
- Body opens with something like: greeting the guardian, one line noting the
  attached PDF contains the health record summary for `{{child_name}}` from
  `{{camp_name}}` (`{{date_range}}`), and a closing line with `{{sender_name}}`.
  Full wording to be drafted with you directly in the admin editor, since this is
  the one piece of copy that's genuinely yours to write, not mine to draft blind.

**Bulk-send confirmation:** something to the effect of "Opravdu odeslat souhrn N
rodičům? Tato akce se nedá vzít zpět." — matching the tone of the existing
cleanup-action confirm dialog in the source app.

---

## Resolved (this pass)

- Meds slots: standard defaults, editable per event — `slot_templates` →
  `event_slots`, same shape as everything else.
- Participant import: paste-from-Sheets now (Screen 1a), live Sheets connection
  planned as a follow-on once that's worth building.
- "Stáhnout PDF" confirmed as a distinct action alongside sending.
- Guardian import shape: one email-only contact column, always a single
  guardian — no name column to map.

## Open items

- Live Google Sheets import's exact Drive/Sheets scope — to confirm once that
  phase is actually being built, not blocking the paste version.
