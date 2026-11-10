import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";

// Organizace -> Vzhled -> Rodičovský portál a kontakt: the contact on the public pages, "Zapomněl(a)
// jsem odkaz" (the mailbox it sends from, same or new link) and the "Ještě nejsem členem" target.
const SELECT = { contactEmail: true, portalRecoverySenderEmail: true, portalRecoveryNewLink: true, portalJoinEventId: true, portalJoinUrl: true } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function guard() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user) };
}

async function view(organizationId: string) {
  const [settings, mailboxes, events] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: SELECT }),
    prisma.mailSenderAccount.findMany({ where: { organizationId }, select: { email: true }, orderBy: { email: "asc" } }),
    prisma.event.findMany({ where: { organizationId, publicRegistration: true, publicSlug: { not: null }, status: "active", isTest: false, AND: [{ OR: [{ kind: "public_event" }, { modules: { some: { moduleKey: "registration", enabled: true } } }] }] }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { settings, mailboxes: mailboxes.map((m) => m.email), events };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  return NextResponse.json(await view(g.organizationId));
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const { mailboxes, events } = await view(g.organizationId);
  const contactEmail = text(b.contactEmail, 200).toLowerCase();
  const sender = text(b.portalRecoverySenderEmail, 200).toLowerCase();
  const joinEventId = text(b.portalJoinEventId, 64);
  const joinUrl = text(b.portalJoinUrl, 500);
  if ((contactEmail && !EMAIL.test(contactEmail)) || (sender && !mailboxes.includes(sender)) || (joinEventId && !events.some((e) => e.id === joinEventId)) || (joinUrl && !/^https?:\/\/\S+$/.test(joinUrl))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  await prisma.organization.update({
    where: { id: g.organizationId },
    data: { contactEmail: contactEmail || null, portalRecoverySenderEmail: sender || null, portalRecoveryNewLink: b.portalRecoveryNewLink === true, portalJoinEventId: joinEventId || null, portalJoinUrl: joinUrl || null },
  });
  return NextResponse.json(await view(g.organizationId));
}
