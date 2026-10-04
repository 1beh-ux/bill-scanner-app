// Sending a child's parent-portal link (docs/registration-portal-spec.md F).
// Same mechanics as the participant sends (src/lib/participant-bulk-email.ts):
// one template, variables per child, per-recipient try/catch, one log row per
// attempt -- and only ever from the compose page after an explicit confirm.
//
// Sending account: these sends belong to no event, so there is no
// Event.senderEmail to use. They go out from the SENDING ADMIN's own connected
// mailbox: the MailSenderAccount with the admin's own address, else the one
// they connected most recently. None connected = nothing is sent (the compose
// page says so before anything happens).
import { prisma } from "@/lib/prisma";
import { senderIdentity, substituteVariables } from "@/lib/email-template";
import { sendPlainTextEmail } from "@/lib/mail";
import { newPortalToken, portalUrl } from "@/lib/portal-gate";
import { PORTAL_LINK_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { profileValues } from "@/lib/portal-rules";

type User = { id: string; email: string; displayName: string; emailSignature: string | null; emailBodySignature: string | null };

/** The admin's own connected sending mailbox (see the file comment), or null. */
export async function orgSenderEmail(user: { id: string; email: string }): Promise<string | null> {
  const own = await prisma.mailSenderAccount.findUnique({ where: { email: user.email }, select: { email: true } });
  if (own) return own.email;
  const connected = await prisma.mailSenderAccount.findFirst({
    where: { connectedByUserId: user.id },
    orderBy: { connectedAt: "desc" },
    select: { email: true },
  });
  return connected?.email ?? null;
}

function loadChild(childId: string) {
  return prisma.child.findUnique({ where: { id: childId }, include: { guardians: { where: { receivesCommunications: true } } } });
}

function vars(child: NonNullable<Awaited<ReturnType<typeof loadChild>>>, link: string, user: User, senderEmail: string | null): Record<string, string> {
  const sender = senderIdentity(user, "Tábor");
  return {
    // The child's profile fields are usable as {{key}} too, like participant fields elsewhere.
    ...profileValues(child),
    child_name: child.name,
    portal_link: link,
    sender_name: sender.name,
    signature: sender.signature,
    sender_email: senderEmail ?? "",
  };
}

/** The e-mail for one child exactly as the send would fill it -- without creating a link that doesn't exist yet. */
export async function previewPortalEmail(opts: { childId: string; subject: string; body: string; user: User; req: Request; noLinkYet: string }) {
  const child = await loadChild(opts.childId);
  if (!child) return null;
  const senderEmail = await orgSenderEmail(opts.user);
  const link = child.portalToken ? portalUrl(child.portalToken, opts.req) : opts.noLinkYet;
  const v = vars(child, link, opts.user, senderEmail);
  return {
    subject: substituteVariables(opts.subject, v),
    body: substituteVariables(opts.body, v),
    recipients: child.guardians.map((g) => g.email),
  };
}

/** Sends the link to every receiving guardian of each child (a missing link is created first). */
export async function sendPortalLinks(opts: { childIds: string[]; subject: string; body: string; user: User; req: Request }) {
  const senderEmail = await orgSenderEmail(opts.user);
  if (!senderEmail) throw new Error("sender_not_connected");
  const sender = senderIdentity(opts.user, "Tábor");
  let sent = 0;
  let failed = 0;
  let noRecipients = 0;
  for (const childId of opts.childIds) {
    let child = await loadChild(childId);
    if (!child) continue;
    if (child.guardians.length === 0) {
      noRecipients++;
      continue;
    }
    if (!child.portalToken) {
      await prisma.child.update({ where: { id: childId }, data: { portalToken: newPortalToken() } });
      child = (await loadChild(childId))!;
    }
    const v = vars(child, portalUrl(child.portalToken!, opts.req), opts.user, senderEmail);
    const subject = substituteVariables(opts.subject, v);
    const body = substituteVariables(opts.body, v);
    for (const g of child.guardians) {
      const log = { childId, email: g.email, purposeKey: PORTAL_LINK_PURPOSE_KEY, sentByUserId: opts.user.id, subject };
      try {
        await sendPlainTextEmail({ to: g.email, fromName: sender.name, senderEmail, subject, body });
        await prisma.childEmailLog.create({ data: { ...log, status: "sent" } });
        sent++;
      } catch (err) {
        await prisma.childEmailLog.create({ data: { ...log, status: "failed", errorMessage: err instanceof Error ? err.message : String(err) } });
        failed++;
      }
    }
  }
  return { sent, failed, noRecipients };
}
