import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { missingRateEvents, parseRateSet } from "@/lib/travel-rates-server";

// Organizace -> Sazby cestovních náhrad (organization admins). GET: the sets (newest first), the organization's
// details printed on orders, and events with no valid set. POST: a new set. PATCH: { address, ico, city }.
async function admin(): Promise<{ error: NextResponse } | { orgId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { orgId: await getActingOrgId(user) };
}

export async function GET() {
  const a = await admin();
  if ("error" in a) return a.error;
  const [sets, org, missing] = await Promise.all([
    prisma.travelRateSet.findMany({ where: { organizationId: a.orgId }, orderBy: { validFrom: "desc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: a.orgId }, select: { name: true, address: true, ico: true, city: true } }),
    missingRateEvents(a.orgId),
  ]);
  return NextResponse.json({ sets, org, missing });
}

export async function POST(req: NextRequest) {
  const a = await admin();
  if ("error" in a) return a.error;
  const parsed = parseRateSet((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("bad" in parsed) return NextResponse.json({ error: "bad_request", bad: parsed.bad }, { status: 400 });
  try {
    const set = await prisma.travelRateSet.create({ data: { ...parsed.data, organizationId: a.orgId } });
    return NextResponse.json(set, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "valid_from_taken" }, { status: 409 });
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const a = await admin();
  if ("error" in a) return a.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : undefined);
  const org = await prisma.organization.update({
    where: { id: a.orgId },
    data: { address: text(b.address, 300), ico: text(b.ico, 20), city: text(b.city, 100) },
    select: { name: true, address: true, ico: true, city: true },
  });
  return NextResponse.json(org);
}
