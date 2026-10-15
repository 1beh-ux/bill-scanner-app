import { prisma } from "@/lib/prisma";

/**
 * The organization's official bank account for an event's settlement: an active payer marked
 * "Oficiální účet organizace" with a bank account -- one attached to the event first.
 * Null = none set (no QR / account line).
 */
export async function officialAccountOf(eventId: string, organizationId: string): Promise<{ name: string; accountNumber: string; bankCode: string } | null> {
  const rows = await prisma.author.findMany({
    where: { organizationId, isOfficialAccount: true, active: true, bankAccountNumber: { not: null }, bankCode: { not: null } },
    select: { canonicalName: true, bankAccountNumber: true, bankCode: true, eventAccess: { where: { eventId }, select: { eventId: true } } },
    orderBy: { canonicalName: "asc" },
  });
  const pick = rows.find((r) => r.eventAccess.length > 0) ?? rows[0];
  return pick ? { name: pick.canonicalName, accountNumber: pick.bankAccountNumber!, bankCode: pick.bankCode! } : null;
}
