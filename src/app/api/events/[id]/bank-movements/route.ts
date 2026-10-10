import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEventBank } from "@/lib/bank/event-access";

// "Platby z banky": movements matched to this event's participants + the account's unresolved ones,
// and the accepted participants for "Přiřadit účastníkovi".
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireEventBank((await params).id);
  if ("error" in scope) return scope.error;
  const { event } = scope;
  const or = [{ participant: { eventId: event.id } }, ...(event.bankAccountId ? [{ bankAccountId: event.bankAccountId, status: "review" as const, participantId: null }] : [])];
  const [movements, participants] = await Promise.all([
    prisma.bankMovement.findMany({
      where: { OR: or },
      orderBy: { bookedAt: "desc" },
      take: 500,
      select: {
        id: true, bookedAt: true, amount: true, currency: true, variableSymbol: true, counterName: true, counterAccount: true, message: true,
        status: true, reason: true, participantId: true, participant: { select: { name: true } }, decidedBy: { select: { displayName: true } },
      },
    }),
    prisma.participant.findMany({ where: { eventId: event.id, active: true, registrationStatus: "accepted" }, select: { id: true, name: true, acceptedVariableSymbol: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({
    movements: movements.map((m) => ({ ...m, amount: Number(m.amount), participantName: m.participant?.name ?? null, decidedBy: m.decidedBy?.displayName ?? null, participant: undefined })),
    participants,
  });
}
