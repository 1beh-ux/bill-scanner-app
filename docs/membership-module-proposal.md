# Členství as a long-term organization module — proposal (2026-10-17)

Status: **proposal, nothing built.** Answers Pavel's point 14: public registration as a long-term
organization setting / module, a membership document valid without a time limit, and once a
year only a renewal that asks existing members to pay for the next year.

## Today

- A membership year is an ordinary event with `kind = membership` + `membershipYear`
  (docs/registration-membership.md). Every year it runs the whole event flow again:
  registration, acceptance e-mail, documents, QR payment.
- `Child` is the identity across years. A connected camp asks "is the child a member?"
  by looking for an accepted participant of the membership event for the camp's year.
- The parent portal (`/p/<token>`) and the public form (`/r/...`) are per event.

The yearly event repeats work that only changes for new members: the parents of current
members fill in the same form and sign the same document again.

## Proposal

### 1. Členové: a register of members kept per organization
A new module **Členství** (organization level, admin plus an explicit grant) with
**Organizace → Členové**: one row per child (the existing `Child`) with
- status: *čeká na schválení* / *člen* / *ukončeno* (with date and reason),
- **member since**, and the **membership document**: generated once at joining, approved
  and stored on the child, **valid with no end date** (a new version only when the template
  changes in a way that needs a signature, or when data changes),
- per year: *zaplaceno / nezaplaceno / prominuto* (see 2).

### 2. Členské období: renewal instead of a yearly event
A light **yearly renewal** (`MembershipPeriod`: year, fee per member or per family, due date,
account, VS scheme, e-mail templates) replaces the yearly event:
- **Vytvořit období 2027** creates a payment request for every active member
  (QR + VS, same VS logic as today);
- the e-mail and the portal say "please renew your membership for 2027"; in the portal the
  parent only **confirms the profile** (the existing pending-changes approval) and pays.
  No new form and no new document;
- the existing **automatic bank check** (Fio) marks the year as paid, as it does for
  registration payments today;
- reminders after the due date; still unpaid after N days → *ukončeno* (or a manual decision).

### 3. Joining: the public form becomes an organization setting
**Organizace → Členství → Přihláška** holds one long-lived public link
(`/r/<org>/clenstvi`), with the same form builder, appearance and embedding as today.
New applicants land in *čeká na schválení*. Approving them generates the document, sends it
for signature/return through the existing document flow, and makes them members. The
current period's payment request is created at the same moment.

### 4. Camps and other events
`isMember()` for a connected event becomes "member, and the period for the event's year is
paid (or waived)". The manual membership field still works as an override. Price rules and
the VS digit stay as they are.

### 5. Moving the existing data
A one-off conversion for each existing membership event: accepted participants → members
(member since = their acceptance date; the document = the one they returned that year);
the year's payments → the period's payments. The old events stay as history (read-only).

### 6. Screens
- Organizace → **Členové**: list, filters (paid this year / unpaid / waiting / ended),
  detail with the history of years and documents, bulk e-mail.
- Organizace → **Členství – nastavení**: form, document template, fee, account, e-mails,
  public link, appearance (one place, the way Pavel asked for event settings in point 12).
- **Období**: create a year, send requests, see payments and reminders.

### Slices
1. Data model (Member, MembershipPeriod, MemberYear) + Členové list + conversion of existing years.
2. Period + payment requests + bank check + e-mails.
3. Long-term public join form + approval → document → member.
4. Portal renewal (confirm profile + pay) + reminders + ending a membership.
5. Reports (members per year, income from fees → Rozpočet/Příjmy of the organization).

## Questions for Pavel before building
1. Is the fee per child or per family (siblings)? Are there discounts?
2. Membership period: calendar year or school year (September–August)?
3. Must the document be signed again after N years (GDPR consent), or only when it changes?
4. Who is a member: only the child, or also parents and leaders (adults)?
5. What happens to someone who hasn't paid: ended automatically after N days, or only flagged
   and decided by hand?
