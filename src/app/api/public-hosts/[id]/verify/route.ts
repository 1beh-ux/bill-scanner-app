import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";
import { verifyHost } from "@/lib/public-host-admin";

// "Ověřit": DNS -> LB_IP, then the landing page over HTTPS.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const { id } = await params;
  // Read-only check, so organization admins may run it -- on their own organization's hosts.
  const host = await prisma.publicHost.findFirst({ where: { id, organizationId: await getActingOrgId(user) }, select: { hostname: true } });
  if (!host) return notFound();
  return NextResponse.json(await verifyHost(host.hostname));
}
