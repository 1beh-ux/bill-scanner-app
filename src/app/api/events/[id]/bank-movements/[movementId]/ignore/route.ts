import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEventBank, eventMovement } from "@/lib/bank/event-access";

// "Ignorovat": an unresolved movement is set aside (reason kept). A settled one is undone by deleting
// its payment document in the roster, which sets the movement ignored too.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; movementId: string }> }) {
  const { id, movementId } = await params;
  const scope = await requireEventBank(id);
  if ("error" in scope) return scope.error;
  const movement = await eventMovement(scope.event, movementId);
  if (movement instanceof NextResponse) return movement;
  if (movement.status !== "review") return NextResponse.json({ error: "not_in_review" }, { status: 409 });
  await prisma.bankMovement.update({ where: { id: movement.id }, data: { status: "ignored", decidedByUserId: scope.userId } });
  return NextResponse.json({ ok: true });
}
