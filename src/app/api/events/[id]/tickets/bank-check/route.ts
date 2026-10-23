import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { checkBankAccount } from "@/lib/bank/check";

// Vstupenky -> Objednávky -> "Zkontrolovat platby teď": the event's Fio account right away
// (the same check as the scheduled one; Fio's 30 s limit answers "throttled").
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { bankCheckEnabled: true, bankAccountId: true } });
  if (!event.bankCheckEnabled || !event.bankAccountId) return NextResponse.json({ error: "no_bank_check" }, { status: 400 });
  return NextResponse.json(await checkBankAccount(event.bankAccountId, { reason: "admin" }));
}
