// Automation (2026-11-27): conditions a participant reaches, and what reacts to them.
//   accepted       the registration is accepted
//   paid           the event's payment document is received
//   doc:<id>       that document type is received (also from the profile / the details)
//   complete       accepted + every tracked document received (payment included)
// runAutomation(eventId, ids?) records each condition the first time it holds (AutomationMark), then:
//   - automatic e-mails (MailRule): once per participant, for conditions reached after the rule was created;
//   - Sheet exports (SheetExport) with one of the newly reached conditions are rewritten.
// Called right after the actions that change these (acceptance, documents, bank pairing) and every 5 minutes as a
// safety net (cron/bank-check -> sweepAutomation). Never throws to the caller.
import { prisma } from "@/lib/prisma";
import { docState } from "@/lib/registration-status";
import { profileDocuments } from "@/lib/person-documents";
import { detailsDocuments } from "@/lib/details-documents";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

export const BASE_CONDITIONS = ["accepted", "paid", "complete"] as const;
export const docCondition = (docTypeId: string) => `doc:${docTypeId}`;

/** Per participant the conditions that hold now. */
export async function currentConditions(eventId: string, participantIds?: string[]): Promise<Map<string, Set<string>>> {
  const [event, types, participants] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { paymentDocTypeId: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, select: { id: true, data: true } }),
    prisma.participant.findMany({
      where: { eventId, active: true, ...(participantIds && { id: { in: participantIds } }) },
      select: { id: true, eventId: true, childId: true, registrationStatus: true, documents: { select: { eventListItemId: true, receivedVia: true, reviewStatus: true } } },
    }),
  ]);
  const tracked = types.filter((t) => !(t.data as DocumentTypeData | null)?.staticAttachment).map((t) => t.id);
  const [fromProfile, fromDetails] = await Promise.all([profileDocuments(participants), detailsDocuments(participants.map((p) => p.id))]);
  const out = new Map<string, Set<string>>();
  for (const p of participants) {
    const docs = [...p.documents, ...(fromProfile.get(p.id) ?? []), ...(fromDetails.get(p.id) ?? [])];
    const has = new Set(tracked.filter((id) => docState(docs, id).state === "received"));
    const c = new Set<string>([...has].map(docCondition));
    const accepted = p.registrationStatus === "accepted";
    if (accepted) c.add("accepted");
    if (event.paymentDocTypeId && has.has(event.paymentDocTypeId)) c.add("paid");
    if (accepted && tracked.every((id) => has.has(id))) c.add("complete");
    out.set(p.id, c);
  }
  return out;
}

/** Records the conditions reached for the first time; returns them per participant (new ones only). */
async function markReached(eventId: string, participantIds?: string[]): Promise<Map<string, string[]>> {
  const now = await currentConditions(eventId, participantIds);
  const marks = await prisma.automationMark.findMany({ where: { participantId: { in: [...now.keys()] } }, select: { participantId: true, condition: true } });
  const known = new Set(marks.map((m) => `${m.participantId}|${m.condition}`));
  const fresh = new Map<string, string[]>();
  const rows: { participantId: string; condition: string; eventId: string }[] = [];
  for (const [pid, conds] of now) {
    const added = [...conds].filter((c) => !known.has(`${pid}|${c}`));
    if (!added.length) continue;
    fresh.set(pid, added);
    rows.push(...added.map((condition) => ({ participantId: pid, condition, eventId })));
  }
  if (rows.length) await prisma.automationMark.createMany({ data: rows, skipDuplicates: true });
  return fresh;
}

/**
 * The event's automation for the given participants (all when omitted). E-mails: every active rule whose condition
 * the participant reached after the rule was created and that wasn't sent to them yet.
 */
export async function runAutomation(eventId: string, participantIds?: string[]): Promise<{ sent: number; exports: number }> {
  try {
    const fresh = await markReached(eventId, participantIds);
    const [rules, exports] = await Promise.all([
      prisma.mailRule.findMany({ where: { eventId, active: true } }),
      prisma.sheetExport.findMany({ where: { eventId, active: true, NOT: { conditions: { isEmpty: true } } } }),
    ]);
    let sent = 0;
    if (rules.length) {
      const { sendRuleEmail } = await import("@/lib/automation-mail");
      for (const rule of rules) {
        const reached = await prisma.automationMark.findMany({
          where: { eventId, condition: rule.condition, reachedAt: { gt: rule.createdAt }, ...(participantIds && { participantId: { in: participantIds } }) },
          select: { participantId: true },
        });
        if (!reached.length) continue;
        const done = new Set((await prisma.mailRuleSend.findMany({ where: { ruleId: rule.id, participantId: { in: reached.map((r) => r.participantId) } }, select: { participantId: true } })).map((s) => s.participantId));
        for (const { participantId } of reached) {
          if (done.has(participantId)) continue;
          // Claimed first: a parallel run never sends the same e-mail twice.
          const claimed = await prisma.mailRuleSend.create({ data: { ruleId: rule.id, participantId } }).then(() => true, () => false);
          if (claimed && (await sendRuleEmail(eventId, rule.purposeKey, participantId))) sent++;
        }
      }
    }
    let ran = 0;
    if (exports.length && fresh.size) {
      const reachedNow = new Set([...fresh.values()].flat());
      const { runSheetExport } = await import("@/lib/sheet-export");
      for (const x of exports.filter((x) => x.conditions.some((c) => reachedNow.has(c)))) {
        await runSheetExport(x.id);
        ran++;
      }
    }
    return { sent, exports: ran };
  } catch (err) {
    console.log(`[automation] event ${eventId}:`, String(err).slice(0, 300));
    return { sent: 0, exports: 0 };
  }
}

/** Every 5 minutes: events with automatic e-mails or condition exports, and the scheduled exports that are due. */
export async function sweepAutomation(now = new Date()): Promise<Record<string, unknown>> {
  const events = await prisma.event.findMany({
    where: { status: "active", OR: [{ mailRules: { some: { active: true } } }, { sheetExports: { some: { active: true, NOT: { conditions: { isEmpty: true } } } } }] },
    select: { id: true },
  });
  const out: Record<string, unknown> = {};
  for (const e of events) out[e.id] = await runAutomation(e.id);
  const { dueExports, runSheetExport } = await import("@/lib/sheet-export");
  for (const x of await dueExports(now)) out[`export:${x}`] = await runSheetExport(x);
  return out;
}

/** A new rule doesn't e-mail people who already met its condition: their marks are recorded first. */
export const baselineMarks = (eventId: string) => markReached(eventId).then(() => undefined);
