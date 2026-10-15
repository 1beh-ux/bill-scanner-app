// Budget settlement with the organization (docs/organizations-change-notes.md "Settlement"),
// pure + client-safe: shared by the manifest's "Souhrn" sheet (approved bills) and Rozpočet.
//   official = paid from the organization's official account: no payer ("Akce") or the payer
//              marked "Oficiální účet organizace";
//   cash     = everything else (paid by the event / people, settled against the deposits).
//   toReturn = deposits - cash (negative = the organization still owes the event).
import { paidOfficially } from "@/lib/payout";

type Num = number | string | { toString(): string } | null;
export type SettlementBill = {
  amountCzk: Num;
  payerAuthor: { isOfficialAccount?: boolean } | null;
  categories: { eventCategoryId: string; amountCzk: Num }[];
};
export type SettlementInput = {
  categories: { id: string; name: string; budget: Num }[];
  bills: SettlementBill[];
  deposits: { amountCzk: Num; receivedAt: Date | string; note?: string | null }[];
};
export type CategoryLine = { id: string | null; name: string; budget: number; spent: number; official: number; cash: number };
export type Settlement = {
  lines: CategoryLine[];
  total: Omit<CategoryLine, "id" | "name">;
  // Bills without a CZK amount (foreign currency without a rate) aren't counted.
  excluded: number;
  depositsTotal: number;
  toReturn: number;
  spentPercent: number | null;
};

const num = (v: Num) => (v === null || v === undefined ? NaN : Number(v.toString()));
const round = (n: number) => Math.round(n * 100) / 100;

export function computeSettlement(input: SettlementInput, uncategorizedLabel = "Bez kategorie"): Settlement {
  const lines = new Map<string | null, CategoryLine>(input.categories.map((c) => [c.id, { id: c.id, name: c.name, budget: num(c.budget) || 0, spent: 0, official: 0, cash: 0 }]));
  let excluded = 0;
  const add = (catId: string | null, amount: number, official: boolean) => {
    let line = lines.get(catId);
    if (!line) {
      line = { id: catId, name: uncategorizedLabel, budget: 0, spent: 0, official: 0, cash: 0 };
      lines.set(catId, line);
    }
    line.spent += amount;
    if (official) line.official += amount;
    else line.cash += amount;
  };
  for (const b of input.bills) {
    const total = num(b.amountCzk);
    if (!Number.isFinite(total)) {
      excluded++;
      continue;
    }
    const official = paidOfficially(b.payerAuthor);
    // One category = the whole bill; a split uses its CZK parts (a part without one: excluded).
    if (b.categories.length === 0) add(null, total, official);
    else if (b.categories.length === 1) add(b.categories[0].eventCategoryId, total, official);
    else
      for (const c of b.categories) {
        const part = num(c.amountCzk);
        if (Number.isFinite(part)) add(c.eventCategoryId, part, official);
        else excluded++;
      }
  }
  const list = [...lines.values()].map((l) => ({ ...l, spent: round(l.spent), official: round(l.official), cash: round(l.cash) }));
  const total = list.reduce((s, l) => ({ budget: s.budget + l.budget, spent: s.spent + l.spent, official: s.official + l.official, cash: s.cash + l.cash }), { budget: 0, spent: 0, official: 0, cash: 0 });
  const depositsTotal = round(input.deposits.reduce((s, d) => s + (num(d.amountCzk) || 0), 0));
  return {
    lines: list,
    total: { budget: round(total.budget), spent: round(total.spent), official: round(total.official), cash: round(total.cash) },
    excluded,
    depositsTotal,
    toReturn: round(depositsTotal - total.cash),
    spentPercent: total.budget > 0 ? Math.round((total.spent / total.budget) * 1000) / 10 : null,
  };
}
