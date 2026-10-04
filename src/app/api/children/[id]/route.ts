import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decideChange, profileFieldLabels, readGuardians, setGuardians, updateProfile } from "@/lib/child-profile";
import { newPortalToken, portalUrl } from "@/lib/portal-gate";
import { profileValues } from "@/lib/portal-rules";

async function requireAdmin(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; error?: undefined } | { user?: undefined; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { user };
}

// Admin child detail (/children/[id]): the whole profile (every org field, any
// portal access), guardians, linked events, pending changes, portal link.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const child = await prisma.child.findUnique({
    where: { id },
    include: {
      guardians: true,
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
    prisma.participantFieldTemplate.findMany({ orderBy: { label: "asc" } }),
    profileFieldLabels(),
  ]);
  const { portalToken, changes, ...rest } = child;
  return NextResponse.json({
    ...rest,
    values: profileValues(child),
    fields: templates.map((t) => ({ key: t.key, label: t.label, fieldType: t.fieldType, options: t.options, active: t.active, portalAccess: t.portalAccess })),
    pendingChanges: changes.map((c) => ({ ...c, childName: child.name, fieldLabel: labels[c.fieldKey] ?? c.fieldKey })),
    portalUrl: portalToken ? portalUrl(portalToken, req) : null,
  });
}

// { values?: Record<key, string>, isAdult?: boolean } -- built-ins + org fields
// (changed values are pushed); isAdult = adult member (slice 3 A).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  if ((body.values !== undefined && (!body.values || typeof body.values !== "object")) || (body.isAdult !== undefined && typeof body.isAdult !== "boolean")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!(await prisma.child.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (body.isAdult !== undefined) await prisma.child.update({ where: { id }, data: { isAdult: body.isAdult } });
  const changed = body.values ? await updateProfile(id, body.values as Record<string, string>) : [];
  return NextResponse.json({ ok: true, changed });
}

// action: "guardians" { guardians } (replace the profile's guardians),
// "token" { regenerate?: boolean } (the link; created when missing, replaced on
// regenerate -- the old link and every device's cookie die at once), or
// "decide" { changeId, accept } (a pending parent change).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
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
    return NextResponse.json({ url: portalUrl(token, req) });
  }

  if (body.action === "decide") {
    const change = await prisma.childChange.findFirst({ where: { id: String(body.changeId), childId: id } });
    if (!change) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const ok = await decideChange(change.id, body.accept === true, user.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "already_decided" }, { status: 409 });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
