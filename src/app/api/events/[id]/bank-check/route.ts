import { NextResponse } from "next/server";
import { requireEventBank } from "@/lib/bank/event-access";
import { checkBankAccount } from "@/lib/bank/check";

// Roster / Pošta "Zkontrolovat platby" (and once on page open).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireEventBank((await params).id);
  if ("error" in scope) return scope.error;
  const { event } = scope;
  if (!event.bankCheckEnabled || !event.bankAccountId) return NextResponse.json({ status: "off" });
  return NextResponse.json(await checkBankAccount(event.bankAccountId, { reason: "event" }));
}
