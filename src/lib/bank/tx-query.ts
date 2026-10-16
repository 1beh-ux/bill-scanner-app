// Banka -> Pohyby: tabs + filters as one Prisma `where`, totals and group subtotals aggregated in
// the database (docs/bank-reconciliation.md A6).
import { Prisma, type BankClassification } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export const TABS = ["todo", "suggested", "paired", "nodoc", "income", "excluded", "all"] as const;
export type Tab = (typeof TABS)[number];
const CONFIRMED = { some: { confirmedAt: { not: null } } } as const;
const OPEN = { some: { confirmedAt: null, rejectedAt: null } } as const;

/**
 * todo      K vyřízení: nothing confirmed, and an expense that needs a document or a row nobody classified yet
 * suggested Návrhy (tier: sure | possible)
 * paired    Spárováno (at least one confirmed pairing)
 * nodoc     Bez dokladu: spending marked as needing no document
 * income    Příjmy
 * excluded  Vyloučeno: private, another event's, own transfers
 */
export function tabWhere(tab: Tab, tier?: string | null): Prisma.BankTransactionWhereInput {
  switch (tab) {
    case "todo":
      return { matches: { none: { confirmedAt: { not: null } } }, OR: [{ classifiedByUser: false }, { classification: "expense", noDocumentNeeded: false }] };
    case "suggested":
      return { matches: tier === "sure" || tier === "possible" ? { some: { confirmedAt: null, rejectedAt: null, tier } } : OPEN };
    case "paired":
      return { matches: CONFIRMED };
    case "nodoc":
      return { noDocumentNeeded: true, classification: { in: ["expense", "cash", "fee"] } };
    case "income":
      return { classification: "income" };
    case "excluded":
      return { classification: { in: ["private", "other_event", "transfer"] } };
    default:
      return {};
  }
}

export type TxFilters = { from?: string; to?: string; dir?: string; min?: string; max?: string; cls?: string; pair?: string; counterparty?: string; person?: string; q?: string };

export function filterWhere(f: TxFilters): Prisma.BankTransactionWhereInput[] {
  const and: Prisma.BankTransactionWhereInput[] = [];
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isDate(f.from)) and.push({ bookingDate: { gte: new Date(f.from!) } });
  if (isDate(f.to)) and.push({ bookingDate: { lte: new Date(f.to!) } });
  if (f.dir === "in") and.push({ amount: { gt: 0 } });
  if (f.dir === "out") and.push({ amount: { lt: 0 } });
  // Amount from / to: of the absolute value.
  const min = Number(f.min), max = Number(f.max);
  if (f.min && Number.isFinite(min)) and.push({ OR: [{ amount: { gte: min } }, { amount: { lte: -min } }] });
  if (f.max && Number.isFinite(max)) and.push({ amount: { gte: -max, lte: max } });
  if (f.cls) and.push({ classification: f.cls as BankClassification });
  if (f.pair === "paired") and.push({ matches: CONFIRMED });
  if (f.pair === "suggested") and.push({ matches: OPEN });
  if (f.pair === "unpaired") and.push({ matches: { none: { rejectedAt: null } } });
  if (f.counterparty) and.push({ counterpartyName: { contains: f.counterparty, mode: "insensitive" } });
  if (f.person) and.push({ personAuthorId: f.person });
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [{ message: { contains: q, mode: "insensitive" } }, { counterpartyName: { contains: q, mode: "insensitive" } }, { vs: { contains: q } }, { note: { contains: q, mode: "insensitive" } }, { userNote: { contains: q, mode: "insensitive" } }] });
  }
  return and;
}

export const txWhere = (eventId: string, tab: Tab, tier: string | null, f: TxFilters): Prisma.BankTransactionWhereInput => ({ AND: [{ eventId }, tabWhere(tab, tier), ...filterWhere(f)] });

/** Příjmy / výdaje / saldo / počet of a where. */
export async function totals(where: Prisma.BankTransactionWhereInput) {
  const [inc, out] = await Promise.all([
    prisma.bankTransaction.aggregate({ where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true }, _count: true }),
    prisma.bankTransaction.aggregate({ where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true }, _count: true }),
  ]);
  const income = Number(inc._sum.amount ?? 0), expense = Number(out._sum.amount ?? 0);
  return { income, expense, saldo: Math.round((income + expense) * 100) / 100, count: inc._count + out._count, incomeCount: inc._count, expenseCount: out._count };
}

export type GroupBy = "classification" | "pair" | "counterparty" | "person" | "month";
export type Group = { key: string | null; income: number; expense: number; count: number; incomeCount?: number; expenseCount?: number };

/** Subtotals of the filtered rows (they add up to totals()). */
export async function groups(where: Prisma.BankTransactionWhereInput, by: GroupBy): Promise<Group[]> {
  if (by === "pair") {
    const parts: [string, Prisma.BankTransactionWhereInput][] = [
      ["paired", { matches: CONFIRMED }],
      ["suggested", { matches: { none: { confirmedAt: { not: null } }, some: { confirmedAt: null, rejectedAt: null } } }],
      ["unpaired", { matches: { none: { OR: [{ confirmedAt: { not: null } }, { rejectedAt: null }] } } }],
    ];
    return Promise.all(parts.map(async ([key, w]) => ({ key, ...(await totals({ AND: [where, w] })) })));
  }
  const field = by === "classification" ? "classification" : by === "counterparty" ? "counterpartyName" : by === "person" ? "personAuthorId" : "bookingDate";
  const rows = await prisma.bankTransaction.groupBy({ by: [field], where, _sum: { amount: true }, _count: true });
  // Income and expense per group need the sign split: two groupBys.
  const signed = await Promise.all([
    prisma.bankTransaction.groupBy({ by: [field], where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
    prisma.bankTransaction.groupBy({ by: [field], where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true } }),
  ]);
  const keyOf = (r: Record<string, unknown>) => {
    const v = r[field];
    if (by === "month") return (v as Date).toISOString().slice(0, 7);
    return v === null || v === undefined ? null : String(v);
  };
  const map = new Map<string | null, Group>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = map.get(k) ?? { key: k, income: 0, expense: 0, count: 0 };
    g.count += r._count;
    map.set(k, g);
  }
  for (const r of signed[0]) map.get(keyOf(r))!.income += Number(r._sum.amount ?? 0);
  for (const r of signed[1]) map.get(keyOf(r))!.expense += Number(r._sum.amount ?? 0);
  return [...map.values()].sort((a, b) => (by === "month" ? String(a.key).localeCompare(String(b.key)) : a.income + a.expense - (b.income + b.expense)));
}

/** Count per tab (the tab labels). */
export async function tabCounts(eventId: string, f: TxFilters) {
  const extra = filterWhere(f);
  const entries = await Promise.all(TABS.map(async (tab) => [tab, await prisma.bankTransaction.count({ where: { AND: [{ eventId }, tabWhere(tab), ...extra] } })] as const));
  const [sure, possible] = await Promise.all(["sure", "possible"].map((tier) => prisma.bankTransaction.count({ where: { AND: [{ eventId }, tabWhere("suggested", tier), ...extra] } })));
  return { ...Object.fromEntries(entries), sure, possible } as Record<Tab | "sure" | "possible", number>;
}
