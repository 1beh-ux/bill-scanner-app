import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { newPortalToken, portalUrl } from "@/lib/portal-gate";
import { familyContacts, suggestFamilies } from "@/lib/portal-rules";
import { childKey } from "@/lib/children";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";

// Families / households on the Lidé page (docs/registration-slice3-spec.md B),
// admin only. Never created automatically: "Navržené rodiny" are proposals
// (people without a family sharing a guardian e-mail) until an admin confirms.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { user };
}

const memberSelect = {
  id: true,
  name: true,
  lastName: true,
  isAdult: true,
  dateOfBirth: true,
  guardians: { select: { name: true, email: true, phone: true } },
} as const;
// A member as listed (guardians stay on the server; contacts are listed separately).
const person = (m: { id: string; name: string; isAdult: boolean; dateOfBirth: Date | null }) => ({ id: m.id, name: m.name, isAdult: m.isAdult, dateOfBirth: m.dateOfBirth });

export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;
  // The acting organization's families and people only.
  const organizationId = await getActingOrgId(user);
  const [families, loose] = await Promise.all([
    prisma.family.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { members: { select: memberSelect, orderBy: [{ isAdult: "desc" }, { dateOfBirth: "asc" }] } } }),
    prisma.child.findMany({ where: { familyId: null, organizationId }, select: memberSelect }),
  ]);
  const byId = new Map(loose.map((c) => [c.id, c]));

  // "Ke kontrole" (slice 3 D): families from the public form, each person with
  // possible duplicates elsewhere -- same name + birth date, or a guardian
  // e-mail already known. Never merged automatically.
  const review = families.filter((f) => f.needsReview);
  const everyone = review.length ? [...families.flatMap((f) => f.members.map((m) => ({ ...m, familyId: f.id }))), ...loose.map((m) => ({ ...m, familyId: null }))] : [];
  const emails = (m: { guardians: { email: string }[] }) => new Set(m.guardians.map((g) => g.email.trim().toLowerCase()));
  const duplicatesOf = (m: (typeof everyone)[number], familyId: string) => {
    const key = childKey(m.name, m.dateOfBirth);
    const mine = emails(m);
    return everyone
      .filter((o) => o.familyId !== familyId && ((key && childKey(o.name, o.dateOfBirth) === key) || [...emails(o)].some((e) => mine.has(e))))
      .map((o) => ({ ...person(o), sameName: !!key && childKey(o.name, o.dateOfBirth) === key }));
  };

  return NextResponse.json({
    review: review.map((f) => ({
      id: f.id,
      name: f.name,
      members: f.members.map((m) => ({ ...person(m), duplicates: duplicatesOf({ ...m, familyId: f.id }, f.id) })),
    })),
    families: families.map(({ portalToken, members, ...f }) => ({
      ...f,
      hasPortalLink: !!portalToken,
      members: members.map(person),
      contacts: familyContacts(members),
    })),
    suggestions: suggestFamilies(loose).map((ids) => {
      const members = ids.map((id) => byId.get(id)!);
      // Proposed name: the most common surname ("Novák" -> the admin can rename to "Novákovi").
      const names = members.map((m) => m.lastName).filter((n): n is string => !!n);
      const name = names.sort((a, b) => names.filter((n) => n === b).length - names.filter((n) => n === a).length)[0] ?? members[0].name;
      return { name, members: members.map(person) };
    }),
  });
}

const cleanName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);

/** Families left without members are deleted (their link dies with them). */
async function dropEmpty(familyIds: (string | null)[]) {
  const list = familyIds.filter((x): x is string => !!x);
  if (list.length) await prisma.family.deleteMany({ where: { id: { in: list }, members: { none: {} } } });
}

// action: "create" { name, childIds } (people without a family), "rename" { familyId, name },
// "add" { familyId, childId }, "remove" { childId }, "merge" { keepId, mergeIds },
// "delete" { familyId } (members stay, just without a family), "token" { familyId, regenerate? },
// "reviewed" { familyId } (a public-form family checked: off the "Ke kontrole" list).
export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  // Every family / person id in any action must be the acting organization's; otherwise "not found".
  const organizationId = await getActingOrgId(user);
  const familyIds = [...new Set([body.familyId, body.keepId, ...ids(body.mergeIds)].filter((x): x is string => typeof x === "string"))];
  const personIds = [...new Set([body.childId, ...ids(body.childIds)].filter((x): x is string => typeof x === "string"))];
  if (familyIds.length && (await prisma.family.count({ where: { id: { in: familyIds }, organizationId } })) !== familyIds.length) return notFound();
  if (personIds.length && (await prisma.child.count({ where: { id: { in: personIds }, organizationId } })) !== personIds.length) return notFound();

  if (body.action === "create") {
    const name = cleanName(body.name);
    const childIds = ids(body.childIds);
    if (!name || childIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const family = await prisma.$transaction(async (tx) => {
      const f = await tx.family.create({ data: { name, organizationId } });
      // Only people not in a family yet: a person is in at most one.
      await tx.child.updateMany({ where: { id: { in: childIds }, familyId: null }, data: { familyId: f.id } });
      return f;
    });
    await dropEmpty([family.id]);
    return NextResponse.json({ ok: true, id: family.id });
  }

  if (body.action === "rename") {
    const name = cleanName(body.name);
    if (!name || typeof body.familyId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await prisma.family.update({ where: { id: body.familyId }, data: { name } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add" || body.action === "remove") {
    if (typeof body.childId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const child = await prisma.child.findUnique({ where: { id: body.childId }, select: { familyId: true } });
    if (!child) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const familyId = body.action === "add" ? (typeof body.familyId === "string" ? body.familyId : null) : null;
    if (body.action === "add" && !(familyId && (await prisma.family.findUnique({ where: { id: familyId } })))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await prisma.child.update({ where: { id: body.childId }, data: { familyId } });
    await dropEmpty([child.familyId]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "merge") {
    const mergeIds = ids(body.mergeIds).filter((id) => id !== body.keepId);
    if (typeof body.keepId !== "string" || mergeIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await prisma.$transaction([
      prisma.child.updateMany({ where: { familyId: { in: mergeIds } }, data: { familyId: body.keepId } }),
      prisma.family.deleteMany({ where: { id: { in: mergeIds } } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reviewed") {
    if (typeof body.familyId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await prisma.family.updateMany({ where: { id: body.familyId }, data: { needsReview: false } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (typeof body.familyId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await prisma.$transaction([
      prisma.child.updateMany({ where: { familyId: body.familyId }, data: { familyId: null } }),
      prisma.family.deleteMany({ where: { id: body.familyId } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // The family link: created when missing, replaced on regenerate (the old link
  // and every device's cookie die at once).
  if (body.action === "token") {
    const family = typeof body.familyId === "string" ? await prisma.family.findUnique({ where: { id: body.familyId } }) : null;
    if (!family) return NextResponse.json({ error: "not_found" }, { status: 404 });
    let token = family.portalToken;
    if (!token || body.regenerate === true) {
      token = newPortalToken();
      await prisma.family.update({ where: { id: family.id }, data: { portalToken: token, portalGateFailures: 0, portalGateWindowStart: null } });
    }
    return NextResponse.json({ url: await portalUrl(token, req) });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
