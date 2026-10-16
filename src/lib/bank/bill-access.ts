import { NextResponse } from "next/server";
import type { Bill, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

/** Bill routes of Banka features: signed in, the bill exists, Účtenky access to its event. */
export async function requireBillAccess(billId: string): Promise<{ error: NextResponse } | { user: User; bill: Bill }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  return denied ? { error: denied } : { user, bill };
}
