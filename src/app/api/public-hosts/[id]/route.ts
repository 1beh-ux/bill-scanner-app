import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkHostInput } from "@/lib/public-host-admin";
import { invalidatePublicHosts } from "@/lib/public-host";

// Edit or (de)activate one public host; the body is the whole row (as in POST).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const { id } = await params;
  if (!(await prisma.publicHost.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const checked = await checkHostInput(await req.json().catch(() => null), id);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const host = await prisma.publicHost.update({ where: { id }, data: checked.data });
  invalidatePublicHosts();
  return NextResponse.json(host);
}
