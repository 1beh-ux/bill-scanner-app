import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkHostInput } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Organizace -> Připojení -> Veřejné adresy (admin only, docs/custom-domain.md).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const [hosts, events] = await Promise.all([
    prisma.publicHost.findMany({ orderBy: [{ active: "desc" }, { hostname: "asc" }], include: { event: { select: { name: true } } } }),
    prisma.event.findMany({ where: { status: "active" }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ hosts, events, lbIpSet: !!process.env.LB_IP });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const checked = await checkHostInput(await req.json().catch(() => null), null);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.create({ data: { ...checked.data, createdByUserId: user.id } });
  invalidatePublicHosts();
  return NextResponse.json(host, { status: 201 });
}
