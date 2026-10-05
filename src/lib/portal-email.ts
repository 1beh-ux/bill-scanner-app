// Sending a parent-portal link (docs/registration-portal-spec.md F; family
// links: docs/registration-slice3-spec.md B). Same mechanics as the participant
// sends (src/lib/participant-bulk-email.ts): one template, variables per
// target, per-recipient try/catch, one log row per attempt -- and only ever
// from the compose page after an explicit confirm.
//
// A target is a child id, or "family:<familyId>" for a family's link (sent to
// every member's receiving guardians, each address once; {{child_name}} = the
// family name). Family sends are logged under every member that has that
// guardian address, so each member's detail lists it.
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

export const FAMILY_TARGET_PREFIX = "family:";

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

type Target = {
  id: string;
  name: string;
  token: string | null;
  // Receiving guardians, each address once.
  emails: string[];
  values: Record<string, string>;
  // Child ids a send to this address is logged under.
  logChildIds: (email: string) => string[];
};

const receiving = { guardians: { where: { receivesCommunications: true } } } as const;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A child or a family as a send target (see the file comment). */
export async function loadTarget(id: string): Promise<Target | null> {
  if (id.startsWith(FAMILY_TARGET_PREFIX)) {
    const family = await prisma.family.findUnique({ where: { id: id.slice(FAMILY_TARGET_PREFIX.length) }, include: { members: { include: receiving } } });
    if (!family || family.members.length === 0) return null;
    const emails: string[] = [];
    for (const g of family.members.flatMap((m) => m.guardians)) if (!emails.some((e) => same(e, g.email))) emails.push(g.email);
    return {
      id,
      name: family.name,
      token: family.portalToken,
      emails,
      values: {},
      logChildIds: (email) => family.members.filter((m) => m.guardians.some((g) => same(g.email, email))).map((m) => m.id),
    };
  }
  const child = await prisma.child.findUnique({ where: { id }, include: receiving });
  if (!child) return null;
  return { id, name: child.name, token: child.portalToken, emails: child.guardians.map((g) => g.email), values: profileValues(child), logChildIds: () => [child.id] };
}

/** Creates the target's link when it has none yet. */
async function ensureToken(target: Target): Promise<string> {
  if (target.token) return target.token;
  const token = newPortalToken();
  if (target.id.startsWith(FAMILY_TARGET_PREFIX)) await prisma.family.update({ where: { id: target.id.slice(FAMILY_TARGET_PREFIX.length) }, data: { portalToken: token } });
  else await prisma.child.update({ where: { id: target.id }, data: { portalToken: token } });
  return token;
}

function vars(target: Target, link: string, user: User, senderEmail: string | null): Record<string, string> {
  const sender = senderIdentity(user, "Tábor");
  return {
    // A child's profile fields are usable as {{key}} too, like participant fields elsewhere.
    ...target.values,
    child_name: target.name,
    portal_link: link,
    sender_name: sender.name,
    signature: sender.signature,
    sender_email: senderEmail ?? "",
  };
}

/** The e-mail for one target exactly as the send would fill it -- without creating a link that doesn't exist yet. */
export async function previewPortalEmail(opts: { childId: string; subject: string; body: string; user: User; req: Request; noLinkYet: string }) {
  const target = await loadTarget(opts.childId);
  if (!target) return null;
  const senderEmail = await orgSenderEmail(opts.user);
  const link = target.token ? portalUrl(target.token, opts.req) : opts.noLinkYet;
  const v = vars(target, link, opts.user, senderEmail);
  return {
    subject: substituteVariables(opts.subject, v),
    body: substituteVariables(opts.body, v),
    recipients: target.emails,
  };
}

/** Sends the link to every receiving guardian of each target (a missing link is created first). */
export async function sendPortalLinks(opts: { childIds: string[]; subject: string; body: string; user: User; req: Request; purposeKey?: string }) {
  const senderEmail = await orgSenderEmail(opts.user);
  if (!senderEmail) throw new Error("sender_not_connected");
  const sender = senderIdentity(opts.user, "Tábor");
  let sent = 0;
  let failed = 0;
  let noRecipients = 0;
  for (const id of opts.childIds) {
    const target = await loadTarget(id);
    if (!target) continue;
    if (target.emails.length === 0) {
      noRecipients++;
      continue;
    }
    const v = vars(target, portalUrl(await ensureToken(target), opts.req), opts.user, senderEmail);
    const subject = substituteVariables(opts.subject, v);
    const body = substituteVariables(opts.body, v);
    for (const email of target.emails) {
      const log = { email, purposeKey: opts.purposeKey ?? PORTAL_LINK_PURPOSE_KEY, sentByUserId: opts.user.id, subject };
      const childIds = target.logChildIds(email);
      try {
        await sendPlainTextEmail({ to: email, fromName: sender.name, senderEmail, subject, body });
        await prisma.childEmailLog.createMany({ data: childIds.map((childId) => ({ ...log, childId, status: "sent" as const })) });
        sent++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.childEmailLog.createMany({ data: childIds.map((childId) => ({ ...log, childId, status: "failed" as const, errorMessage })) });
        failed++;
      }
    }
  }
  return { sent, failed, noRecipients };
}
