export type SplitRow = { eventCategoryId: string; amount: string };

// What the bill edit form holds, as one comparable string. "Unsaved changes" = the
// current snapshot differs from the one taken when the bill was loaded or last saved.
export function formSnapshot(f: {
  merchant: string;
  date: string;
  total: string;
  currency: string;
  payer: string;
  notes: string;
  splits: SplitRow[];
}): string {
  return JSON.stringify([f.merchant, f.date, f.total, f.currency, f.payer, f.notes, f.splits.map((x) => [x.eventCategoryId, x.amount])]);
}
