import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyHost } from "@/lib/public-host-admin";

// "Ověřit": DNS -> LB_IP, then the landing page over HTTPS.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const { id } = await params;
  const host = await prisma.publicHost.findUnique({ where: { id }, select: { hostname: true } });
  if (!host) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await verifyHost(host.hostname));
}
