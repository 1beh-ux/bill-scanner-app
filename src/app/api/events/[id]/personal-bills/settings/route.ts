import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personalGuard, resolvePerson } from "@/lib/personal-bills-server";

// "Pokladník akce": PATCH { treasurer: person key | null } -- who pays out the event's reimbursements; personal
// bills they paid for are netted with each person's payout (Platby).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as { treasurer?: unknown };
  const treasurerAuthorId = b.treasurer == null || b.treasurer === "" ? null : await prisma.$transaction((tx) => resolvePerson(tx, id, g.event.organizationId, b.treasurer));
  if (b.treasurer && !treasurerAuthorId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.event.update({ where: { id }, data: { treasurerAuthorId } });
  return NextResponse.json({ treasurerAuthorId });
}
