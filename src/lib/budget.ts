// Budget-vs-actual display rules for one category row or the totals row.
// A budget of 0 (or unset) means "not set", NOT "spend nothing": it must never
// look like an overrun, and there is no meaningful percentage or remainder.
export type BudgetState = {
  hasBudget: boolean;
  /** Red only when a budget exists and the actual spending exceeds it. */
  over: boolean;
  /** Budget minus actual; null when there is no budget. */
  remaining: number | null;
  /** 0-100 for the progress bar; null when there is no budget (no bar at all). */
  percent: number | null;
};

export function budgetState(budget: number, actual: number): BudgetState {
  const b = Number.isFinite(budget) ? budget : 0;
  const a = Number.isFinite(actual) ? actual : 0;
  if (b <= 0) return { hasBudget: false, over: false, remaining: null, percent: null };
  return { hasBudget: true, over: a > b, remaining: b - a, percent: Math.min((a / b) * 100, 100) };
}
