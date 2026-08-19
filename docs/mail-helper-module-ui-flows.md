# Mail Helper Module — UI Flows, Screens & Copy (Draft v1)

Status: draft. Companion to `mail-helper-module-design.md`. Route paths assume the
same App Router structure as Bills and Health. Screens are drafted already-consolidated
rather than maximally split — Health's actual build repeatedly merged what the
original draft had as separate screens (the meds grid, most notably), so this draft
starts from that lesson rather than repeating the over-split pattern.

---

## Navigation & visibility

A "Pošta" (Mail) item appears in the event sidebar under the same rule as every other
module: `event_modules.mail.enabled` **and** `user_event_module_access` for that
user/event/module. No mailbox connected yet doesn't hide the nav item — it routes to
a connect-mailbox prompt instead (see Screen 5), same as any other empty-state.

---

## Screens

### 1. Inbox & email detail — `/events/[id]/mail`

One page, two-panel layout — mirrors the old app's actual working layout rather than
splitting inbox and detail into separate routes.

**Left panel (inbox):** message list from the connected mailbox, sortable
oldest/newest, a count input, a select-mode toggle for bulk actions (select-all,
clear, move-to-done, delete — each logged to `MailActionLog`).

**Right panel (detail), once a message is selected:**
- From / subject / date / body snippet
- Participant field: auto-detected by substring-matching participant names against
  subject+body (longest match wins, same heuristic as the old app), with a
  search+dropdown override
- Attachments list — each row: filename, a document-type dropdown (defaulted from a
  filename-keyword guess against `EventListItem.data.filenameSuffix`), and a
  **participant override dropdown** defaulting to the email's main participant but
  independently changeable per attachment — this is a real, deliberate feature from
  the old app (one email can cover two siblings), not incidental complexity, and
  needs to carry over exactly
- Preview button per attachment — opens a lightweight modal rendering the proxied
  attachment directly (no temp files, per the design doc's infra section)
- Optional free-text note field
- Reply draft — live-regenerating textarea, editable before sending, rebuilt whenever
  the participant, attachment actions, or note change
- Four action checkboxes (save attachments / send reply / move email / update status),
  independently toggleable, defaulting all-checked
- "Provést vybrané akce" — executes the checked actions, then **auto-advances to the
  next email** in the current sort order (a genuinely good triage habit from the old
  app, worth keeping exactly)
- "Smazat email" — separate, always available, confirms before trashing

### 2. Bulk status update — modal from Screen 1

"Hromadný status update" button opens a modal: loads the full roster (participants
with a guardian email on file), a status grid — one row per participant, one column
per document type, received/missing — defaulting checked-to-send for anyone **not**
fully complete (so finished families aren't re-contacted), an editable template
preview above the table, check/uncheck individually or in bulk, and a send button.
Uses the `mail_helper_bulk_status_update` `EmailTemplate` purpose key and the same
bulk-send-with-per-recipient-failure-isolation infrastructure Health's summary send
already has. Logged to `ParentEmailLog`.

### 3. Action log — modal from Screen 1

Merges `MailActionLog` and the two Mail Helper `ParentEmailLog` purpose keys into one
timeline, newest first — action type, status (ok/error), timestamp, user, participant
and subject where relevant. Same shape as the old app's Logs modal.

### 4. Document type admin — `/templates` (new tab) + per-event copy

No new component — `ListTemplateAdmin` already handles org-default and per-event
copies generically across kinds; this is a fourth tab (`document`) alongside meds,
slots, and situations, both on the org-wide `/templates` page and within an event's
settings.

### 5. Mailbox connection — reuses Health's `SenderEmailField` / OAuth flow

Same connect/re-authorize UI already built for Health's sending, requesting the
broadened scope (send + read/modify) this module needs. If an event's connected
mailbox was authorized under Health's narrower scope, this screen is where the
re-consent prompt surfaces — not a separate flow.

### 6. Sync settings — within event settings

- Drive document mirror: on/off toggle, "Synchronizovat nyní" button, last-synced
  timestamp
- Status Sheet export: same on/off + "Synchronizovat nyní" pairing, plus a direct
  link to the generated Sheet once one exists (`Event.status_export_sheet_id`)
- Both are one-way and the settings copy should say so plainly — see below

---

## Representative copy (Czech — not exhaustive)

**Screen headers:** "Doručená pošta", "Hromadný status update", "Poslední akce",
"Typy dokumentů"

**Buttons:** "Provést vybrané akce", "Smazat email", "Přesunout vybrané",
"Smazat vybrané", "Synchronizovat nyní", "Obnovit návrh"

**Action checkboxes:** "💾 Uložit přílohy", "📧 Odeslat odpověď", "📁 Přesunout email",
"📊 Aktualizovat tabulku"

**Sync settings warning banner:** something to the effect of "Tento list se
automaticky generuje z aplikace — úpravy zde se do aplikace nepropíšou." (This sheet
is auto-generated from the app — edits here don't sync back.) Same idea for the Drive
mirror folder, wherever it's introduced to non-technical users.

**Bulk-send confirmation:** matching the tone already used for Health's bulk send —
count of recipients, plain statement that the action can't be undone.

---

## Open items

- Whether the attachment-preview modal should reuse Health's existing preview
  component pattern or needs its own, given the source is a proxied Gmail
  attachment rather than a GCS object — worth a quick look at `PdfExportControls.tsx`
  and friends before assuming either way.
- Auto-advance-to-next-email behavior on delete/execute — confirm the sort order used
  for "next" should be whatever the user currently has selected (oldest/newest), same
  as the old app, rather than a fixed order.
