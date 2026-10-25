// "Zapomněl(a) jsem odkaz do portálu" (2026-10-23): a parent types an e-mail and the birth date of any
// person of their portal; when a person with that birth date belongs to a link (their family's, else
// their own) whose receiving guardians include that e-mail, the link goes to THAT address only. The
// organization decides whether it's the same link or a new one (the old stops working -- for links
// that were passed on to people they don't belong to). The caller never learns whether anything matched.
import { prisma } from "@/lib/prisma";
import { getOrCreateOrgEmailTemplate, substituteVariables } from "@/lib/email-template";
import { sendEmailWithOptionalAttachment } from "@/lib/mail";
import { templateFiles } from "@/lib/email-files";
import { portalUrl } from "@/lib/portal-gate";
import { FAMILY_TARGET_PREFIX, ensureToken, loadTarget } from "@/lib/portal-email";
import { PORTAL_LINK_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { isIsoDate } from "@/lib/portal-rules";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Sends the matching links; returns how many went out (for the log line only, never to the caller). */
export async function recoverPortalLink(o: { organizationId: string; email: string; birthDate: string; req: Request }): Promise<number> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: o.organizationId }, select: { name: true, portalRecoverySenderEmail: true, portalRecoveryNewLink: true } });
  if (!org.portalRecoverySenderEmail || !isIsoDate(o.birthDate)) return 0;
  const day = new Date(`${o.birthDate}T00:00:00Z`);
  const people = await prisma.child.findMany({
    where: { organizationId: o.organizationId, leftAt: null, dateOfBirth: { gte: day, lt: new Date(day.getTime() + 24 * 3600 * 1000) } },
    select: { id: true, familyId: true },
  });
  const targetIds = [...new Set(people.map((p) => (p.familyId ? `${FAMILY_TARGET_PREFIX}${p.familyId}` : p.id)))];
  const template = await getOrCreateOrgEmailTemplate(o.organizationId, PORTAL_LINK_PURPOSE_KEY);
  let sent = 0;
  for (const id of targetIds) {
    const target = await loadTarget(id);
    const email = target?.emails.find((e) => same(e, o.email));
    if (!target || !email) continue;
    const link = await portalUrl(await ensureToken(target, org.portalRecoveryNewLink), o.req);
    const vars = { ...target.values, child_name: target.name, organization_name: org.name, portal_link: link, sender_name: org.name, signature: org.name, sender_email: org.portalRecoverySenderEmail };
    const subject = substituteVariables(template.subject, vars);
    const log = { email, purposeKey: PORTAL_LINK_PURPOSE_KEY, sentByUserId: null, subject };
    try {
      await sendEmailWithOptionalAttachment({ to: email, fromName: org.name, senderEmail: org.portalRecoverySenderEmail, subject, body: substituteVariables(template.body, vars), attachments: await templateFiles(o.organizationId, null, PORTAL_LINK_PURPOSE_KEY) });
      await prisma.childEmailLog.createMany({ data: target.logChildIds(email).map((childId) => ({ ...log, childId, status: "sent" as const })) });
      sent++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message.slice(0, 300) : "send_failed";
      await prisma.childEmailLog.createMany({ data: target.logChildIds(email).map((childId) => ({ ...log, childId, status: "failed" as const, errorMessage })) });
    }
  }
  return sent;
}
