import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";
import { groups, inSeries, tabCounts, totals, txWhere, TABS, type GroupBy, type Tab, type TxFilters } from "@/lib/bank/tx-query";

const LIMIT = 1000;
const GROUPS: GroupBy[] = ["classification", "pair", "counterparty", "person", "month"];

// Banka -> Pohyby: rows of a tab + filters, tab counts, totals of the filtered rows, optional subtotals.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const q = req.nextUrl.searchParams;
  const tab = (TABS as readonly string[]).includes(q.get("tab") ?? "") ? (q.get("tab") as Tab) : "todo";
  const f: TxFilters = Object.fromEntries(["from", "to", "dir", "min", "max", "cls", "pair", "counterparty", "person", "q"].map((k) => [k, q.get(k) ?? undefined]));
  const where = txWhere(id, tab, q.get("tier"), f);
  const by = GROUPS.includes(q.get("group") as GroupBy) ? (q.get("group") as GroupBy) : null;
  const [rows, counts, sum, grouped, authors] = await inSeries([
    () => prisma.bankTransaction.findMany({
      where,
      orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
      take: LIMIT,
      include: {
        matches: {
          where: { rejectedAt: null },
          orderBy: [{ confirmedAt: "desc" }, { score: "desc" }],
          select: { id: true, amountCzk: true, confirmedAt: true, tier: true, reasons: true, setPaidToAuthor: true, bill: { select: { id: true, merchantName: true, billDate: true, amountCzk: true, displayFilename: true, originalFilename: true, documentMissing: true } } },
        },
      },
    }),
    () => tabCounts(id, f),
    () => totals(where),
    () => (by ? groups(where, by) : Promise.resolve(null)),
    () => prisma.author.findMany({ where: { organizationId: ctx.event.organizationId }, select: { id: true, canonicalName: true } }),
  ] as const);
  const name = new Map(authors.map((a) => [a.id, a.canonicalName]));
  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      originalAmount: r.originalAmount === null ? null : Number(r.originalAmount),
      person: r.personAuthorId ? name.get(r.personAuthorId) ?? null : null,
      reimbursementOf: r.reimbursementAuthorId ? name.get(r.reimbursementAuthorId) ?? null : null,
      matches: r.matches.map((m) => ({ ...m, amountCzk: Number(m.amountCzk), bill: { ...m.bill, amountCzk: m.bill.amountCzk === null ? null : Number(m.bill.amountCzk) } })),
    })),
    truncated: rows.length === LIMIT,
    counts,
    totals: sum,
    groups: grouped?.map((g) => ({ ...g, label: by === "person" && g.key ? name.get(g.key) ?? g.key : g.key })) ?? null,
    authors,
  });
}
