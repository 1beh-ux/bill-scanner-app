import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEventBank, eventMovement } from "@/lib/bank/event-access";
import { settleMovement } from "@/lib/bank/check";

// "Přiřadit účastníkovi": the payment document (receivedVia bank) for one of this event's participants.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; movementId: string }> }) {
  const { id, movementId } = await params;
  const scope = await requireEventBank(id);
  if ("error" in scope) return scope.error;
  const { event, userId } = scope;
  const movement = await eventMovement(event, movementId);
  if (movement instanceof NextResponse) return movement;
  if (movement.status === "settled") return NextResponse.json({ error: "already_settled" }, { status: 409 });
  const { participantId } = await req.json().catch(() => ({}));
  const inEvent = typeof participantId === "string" && (await prisma.participant.count({ where: { id: participantId, eventId: event.id } }));
  if (!inEvent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!event.paymentDocTypeId) return NextResponse.json({ error: "no_payment_doc" }, { status: 400 });
  if (!(await settleMovement(movement.id, participantId, event.paymentDocTypeId, userId))) return NextResponse.json({ error: "already_paid" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
