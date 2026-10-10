import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decideChange, profileFieldLabels, readGuardians, setGuardians, updateProfile } from "@/lib/child-profile";
import { newPortalToken, portalUrl } from "@/lib/portal-gate";
import { leftData, profileValues } from "@/lib/portal-rules";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";

// Admin of the acting organization, and the person is in it (anyone else's person: 404).
async function requireAdmin(id: string): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; organizationId: string; error?: undefined } | { user?: undefined; organizationId?: undefined; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  const organizationId = await getActingOrgId(user);
  if (!(await prisma.child.findFirst({ where: { id, organizationId }, select: { id: true } }))) return { error: notFound() };
  return { user, organizationId };
}

// Admin child detail (/children/[id]): the whole profile (every org field, any
// portal access), guardians, linked events, pending changes, portal link.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, organizationId } = await requireAdmin(id);
  if (error) return error;
  const child = await prisma.child.findUnique({
    where: { id },
    include: {
      guardians: true,
      family: { select: { id: true, name: true } },
      participants: {
        select: {
          id: true,
          registrationStatus: true,
          active: true,
          portalNote: true,
          event: { select: { id: true, name: true, startDate: true, status: true, kind: true, membershipYear: true, registrationConnected: true } },
        },
        orderBy: { event: { startDate: "desc" } },
      },
      changes: { where: { status: "pending" }, orderBy: { createdAt: "asc" } },
      emailLogs: { orderBy: { sentAt: "desc" }, take: 20, select: { id: true, email: true, status: true, errorMessage: true, sentAt: true, subject: true } },
    },
  });
  if (!child) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [templates, labels] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { organizationId }, orderBy: { label: "asc" } }),
    profileFieldLabels(organizationId),
  ]);
  const { portalToken, changes, ...rest } = child;
  return NextResponse.json({
    ...rest,
    values: profileValues(child),
    fields: templates.map((t) => ({ key: t.key, label: t.label, fieldType: t.fieldType, options: t.options, active: t.active, portalAccess: t.portalAccess, audience: t.audience, level: t.level })),
    pendingChanges: changes.map((c) => ({ ...c, childName: child.name, fieldLabel: labels[c.fieldKey] ?? c.fieldKey })),
    portalUrl: portalToken ? await portalUrl(portalToken, req) : null,
  });
}

// { values?: Record<key, string>, isAdult?: boolean, inactive?: boolean, leftNote?: string }
// -- built-ins + org fields (changed values are pushed); isAdult = adult member
// (slice 3 A); inactive = the admin's "Neaktivní" toggle (slice 8 #2, leftVia = admin).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAdmin(id);
  if (error) return error;
  const body = await req.json();
  if (
    (body.values !== undefined && (!body.values || typeof body.values !== "object")) ||
    (body.isAdult !== undefined && typeof body.isAdult !== "boolean") ||
    (body.inactive !== undefined && typeof body.inactive !== "boolean")
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!(await prisma.child.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (body.isAdult !== undefined) await prisma.child.update({ where: { id }, data: { isAdult: body.isAdult } });
  if (body.inactive !== undefined) await prisma.child.update({ where: { id }, data: leftData(body.inactive, "admin", body.leftNote) });
  const changed = body.values ? await updateProfile(id, body.values as Record<string, string>) : [];
  return NextResponse.json({ ok: true, changed });
}

// action: "guardians" { guardians } (replace the profile's guardians),
// "token" { regenerate?: boolean } (the link; created when missing, replaced on
// regenerate -- the old link and every device's cookie die at once), or
// "decide" { changeId, accept } (a pending parent change).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireAdmin(id);
  if (error) return error;
  const body = await req.json();
  const child = await prisma.child.findUnique({ where: { id }, select: { id: true, portalToken: true } });
  if (!child) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.action === "guardians") {
    const guardians = readGuardians(body.guardians);
    if (!guardians) return NextResponse.json({ error: "bad_guardians" }, { status: 400 });
    await setGuardians(id, guardians);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "token") {
    let token = child.portalToken;
    if (!token || body.regenerate === true) {
      token = newPortalToken();
      await prisma.child.update({ where: { id }, data: { portalToken: token, portalGateFailures: 0, portalGateWindowStart: null } });
    }
    return NextResponse.json({ url: await portalUrl(token, req) });
  }

  if (body.action === "decide") {
    const change = await prisma.childChange.findFirst({ where: { id: String(body.changeId), childId: id } });
    if (!change) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const ok = await decideChange(change.id, body.accept === true, user.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "already_decided" }, { status: 409 });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
