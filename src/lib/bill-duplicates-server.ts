// Loading for possible duplicates (src/lib/bill-duplicates.ts): an event's bills, its dismissed pairs,
// and -- for the "content" rule -- bills with the same file in other events the user has Účtenky in.
import type { User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/module-access";
import { pairKey, type DupBill } from "@/lib/bill-duplicates";

const select = { id: true, eventId: true, contentHash: true, totalAmount: true, currency: true, amountCzk: true, billDate: true, merchantName: true } as const;
type Row = { id: string; eventId: string; contentHash: string; totalAmount: unknown; currency: string; amountCzk: unknown; billDate: Date | null; merchantName: string | null };
const toDup = (b: Row): DupBill => ({
  id: b.id,
  // A bill created from a bank payment has a synthetic hash ("bank:<tx>"): no content to compare.
  contentHash: b.contentHash.startsWith("bank:") ? null : b.contentHash,
  totalAmount: b.totalAmount === null ? null : Number(b.totalAmount),
  currency: b.currency,
  amountCzk: b.amountCzk === null ? null : Number(b.amountCzk),
  billDate: b.billDate ? b.billDate.toISOString().slice(0, 10) : null,
  merchantName: b.merchantName,
});

export async function dismissedPairs(billIds: string[]): Promise<Set<string>> {
  if (!billIds.length) return new Set();
  const rows = await prisma.billDuplicateDismissal.findMany({ where: { OR: [{ billAId: { in: billIds } }, { billBId: { in: billIds } }] }, select: { billAId: true, billBId: true } });
  return new Set(rows.map((r) => pairKey(r.billAId, r.billBId)));
}

/** The event's bills (+ same-file bills in other accessible events when `user` is given) as DupBills. */
export async function loadDupBills(eventId: string, user?: User) {
  const own = await prisma.bill.findMany({ where: { eventId, status: { not: "failed" } }, select });
  let others: Row[] = [];
  if (user) {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
    const hashes = own.map((b) => b.contentHash).filter((h) => !h.startsWith("bank:"));
    const candidates = hashes.length ? await prisma.bill.findMany({ where: { contentHash: { in: hashes }, eventId: { not: eventId }, event: { organizationId: event.organizationId } }, select }) : [];
    const access = new Map<string, boolean>();
    for (const e of new Set(candidates.map((c) => c.eventId))) access.set(e, await hasModuleAccess(user, e, "bills"));
    others = candidates.filter((c) => access.get(c.eventId));
  }
  const all = [...own, ...others];
  return { dup: all.map(toDup), eventOf: new Map(all.map((b) => [b.id, b.eventId])), dismissed: await dismissedPairs(all.map((b) => b.id)) };
}
