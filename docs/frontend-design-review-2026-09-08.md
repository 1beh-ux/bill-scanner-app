# Frontend Design Review — 2026-09-08

Walked the live app (bills, health, event settings) signed in as an admin, alongside
reading the styling code. Findings below are what's actually there, not a redesign yet —
that's the next conversation.

## What's already there

There's a real token system in `src/app/globals.css`: a named palette (`paper`/`ink`/
`ember`/`pine`/`night`) with a working light/dark pair, plus IBM Plex Sans/Mono loaded
deliberately in `layout.tsx`. That's a considered starting point, not a Tailwind
default — but it's inconsistently applied. Most screens use it correctly (sidebar,
tables, form fields on the bill detail page). A few don't use it at all.

## Concrete findings

**Login page never joined the design system.** `src/app/login/page.tsx` is still
exactly the milestone-0 scaffolding from the original setup runbook: an inline-styled
`<div>` centering a bare, unstyled `<button>Přihlásit se přes Google</button>` on a
blank page. It's the very first thing anyone sees, and it looks like the app is
broken or half-built, even though everything past it doesn't.

**Sidebar isn't sticky.** On any page with a long list (the bills table at 100+ rows,
for instance), scrolling the page scrolls the sidebar and top event-switcher away
with it — you lose all navigation and land looking at a disorienting blank gap above
a floating nav. A left-nav shell like this should stay pinned while content scrolls.

**Wide tables have no horizontal scroll containment.** The bills table's rightmost
columns (Date, in particular) get clipped by the viewport edge with no `overflow-x`
affordance — the data's there, you just can't see or reach it without a workaround.
Same risk on any other wide table (meds grid, budget summary).

**Translation keys flash on every navigation.** `src/lib/i18n.tsx` (lines 61–72)
re-fetches the entire `translations` table from `/api/translations` in a `useEffect`
on every mount, with no cache — so every fresh page load briefly renders raw keys
(`billsPage.title`, `nav.bills`, `common.loading`) before real text pops in. Highly
visible, happens constantly, and is a straightforward fix (cache the fetch, or move
it out of client-only fetch entirely). Full treatment belongs in the ponytail pass,
flagging here because it's very much a visible design defect too.

**Content language leaks.** Category descriptions in the settings tab are English
("Car operation costs: fuel, parking...") inside an otherwise all-Czech UI — reads as
unfinished localization rather than a deliberate bilingual choice.

**No visual identity specific to what this actually is.** This is software for a kids'
camp organization (Pionýrská skupina Záře), and right now it reads as a generic
internal admin tool — dense native-feeling tables, default date inputs, "+ label"
text links instead of real buttons in places, flat type hierarchy with almost no
distinction between primary and secondary information. The token system gives you a
foundation to build real personality on (the `pine`/`ember` pairing has warmth
already), but nothing in the actual screens reflects the subject matter. That's the
biggest opportunity, not a defect to fix — a specific, deliberate identity here would
go a long way given how much of the rest of the UI is already functionally solid.

## Suggested priority (for discussion, not yet actioned)

1. Fix the login page — highest visibility-to-effort ratio, currently the worst
   thing in the app by far.
2. Make the sidebar sticky.
3. Contain wide tables in a scroll wrapper.
4. Fix the translation fetch to stop flashing raw keys.
5. Establish a real visual identity pass (colors are half-there already; typography,
   iconography, and imagery are the gap) — bigger, more subjective, worth a separate
   conversation on direction before touching code.
6. Clean up the stray English content in category descriptions.

Everything above is diagnosis. Next: agree on which of these to act on, then the
ponytail pass covers code-level correctness/simplicity separately (including a
closer look at that translation re-fetch and a "why did the browser hang for ~30s
mid-navigation a few times" performance question that came up during this walkthrough).
