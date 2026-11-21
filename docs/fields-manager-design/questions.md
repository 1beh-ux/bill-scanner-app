# Fields Manager — questions

## Answered (2026-11-21)

| # | Question | Answer |
|---|---|---|
| Q1 | Where is the production design document? | It is the prototype's "What changes" tab; checked in `findings.md` §8. |
| Q2 | Decision A: `level` ≠ storage — use a per-template `storage` setting? | Agreed. |
| Q5 | Address: keep the split fields stored, `adresa` calculated, no `address` type in v1? | Agreed. |
| Q6 | Membership group: no merge? | Agreed (no merge). |
| Q8 | Rename: also rename the template's event copies? | Yes, enabled — **with a confirmation** (design §6a). |
| Q9 | Decision B: keep the organization flag's second meaning, add "copy as default"? | Agreed. |
| Q11 | Documents fall back to the profile; imports write profiles? | "Do what's best": both only with the flag on, as designed. |
| — | Calculated fields on top of today's composite fields; 6 guardian slots | Agreed. |

**Q3 (decided by me, as you asked to do what's best):** all templates keep `storage = profile` (today's behaviour) at
release; the manager lets an admin switch one. Recommendation for Záře once the flag is on: switch only
`velikost_trika` (t-shirt) to registration-only; the rest are about the child, not the event.

## Still open — each with the default the plan uses

**Q4. Who may use the manager?** *Default:* organization admins for fields, renames and merges; event admins for
import, the review queue, event variables and documents of their own events. | Answer: i agree.

**Q7. Name.** The prototype makes `Name` calculated (first + last); in the code it is stored and used for matching
and file names. *Default:* `Name` stays stored, shown as "fixed".| Answer: i agree. 

**Q10. Payment account variable.** Two sources: `Event.registrationBankAccountNumber/Code` (the QR in documents) and
`Event.bankAccountId` (bank module); tickets have their own. *Default:* the registration account, bank-module account
as fallback. | Answer: agree

**Q12. Consent withdrawn on the profile.** *Default:* only new registrations take the new value; existing ones keep
what was agreed for their event. | Answer: agree

**Q13. 30-minute syncs.** *Default:* not in v1 (shortest stays 1 hour). | Answer: explained 2026-11-21 (automatic sheet re-read every 30 min instead of hourly) — not in v1.

**Q14. `leader_name`, `contact_phone`, `payment_deadline`** (not stored today). *Default:* per-event free variables
created in the manager.  agree

**Q15. Ticket variables** `event_name` / `event_date` / `event_place` as aliases of `camp_name` / `date_range` / `place`.
*Default:* yes. | Answer:  yes

**Q16. One flag or one per phase?** *Default:* one organization flag `fields_manager`.  agree

**Q17 (new). Guardian count on the public form.** The form already accepts up to **10** guardians per family; imports
and documents get 6 slots. *Default:* keep the form's 10 (stored as rows), slots 1–6 address the first six by
position; a 7th+ guardian is kept but has no `guardianN_…` key. | Answer:  i agree

**Q18 (new). "Dítě nesmí být vydáno" in the Tábor 2026 – official connection** is mapped to `vydani_osoby` ("may be
handed over to"), the opposite meaning. *Default:* create a separate field `nevydavat_osobam` ("must not be handed
over to") when that connection is fixed up in phase 4. OK?  | Answer: agree
