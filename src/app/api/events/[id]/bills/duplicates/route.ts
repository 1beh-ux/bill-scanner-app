import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess, hasModuleAccess } from "@/lib/module-access";
import { findDuplicateGroups, pairKey } from "@/lib/bill-duplicates";
import { loadDupBills } from "@/lib/bill-duplicates-server";

type Ctx = { params: Promise<{ id: string }> };

/** Possible duplicate groups; ?ids=a,b only groups involving those bills. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const { dup, dismissed } = await loadDupBills(id, user);
  const groups = findDuplicateGroups(dup, dismissed, ids.length ? new Set(ids) : undefined);
  const billIds = [...new Set(groups.flatMap((g) => g.billIds))];
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds } },
    select: {
      id: true, eventId: true, status: true, merchantName: true, billDate: true, totalAmount: true, currency: true, amountCzk: true, originalFilename: true, displayFilename: true,
      gcsObjectPath: true, contentHash: true, notes: true, paidToAuthor: true, createdAt: true, ingestChannel: true,
      payerAuthor: { select: { canonicalName: true, isOfficialAccount: true, payoutNeeded: true } },
      event: { select: { name: true } },
      bankMatches: { where: { confirmedAt: { not: null } }, select: { id: true } },
    },
  });
  return NextResponse.json({
    groups,
    bills: bills.map((b) => ({ ...b, totalAmount: b.totalAmount === null ? null : Number(b.totalAmount), amountCzk: b.amountCzk === null ? null : Number(b.amountCzk), hasFile: !!b.gcsObjectPath, gcsObjectPath: undefined, bankPaired: b.bankMatches.length > 0, bankMatches: undefined })),
  });
}

/** "Není duplicita": { billIds } -> every pair among them is remembered as not a duplicate. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const requested: string[] = Array.isArray(body.billIds) ? body.billIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 50) : [];
  const bills = await prisma.bill.findMany({ where: { id: { in: requested } }, select: { id: true, eventId: true } });
  // At least one in this event; every bill in an event the user has Účtenky in.
  if (bills.length < 2 || !bills.some((b) => b.eventId === id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  for (const e of new Set(bills.map((b) => b.eventId))) if (!(await hasModuleAccess(user, e, "bills"))) return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
  const data = [];
  for (let i = 0; i < bills.length; i++) for (let j = i + 1; j < bills.length; j++) {
    const [a, b] = pairKey(bills[i].id, bills[j].id).split(":");
    data.push({ billAId: a, billBId: b, userId: user.id });
  }
  await prisma.billDuplicateDismissal.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ ok: true, pairs: data.length });
}
