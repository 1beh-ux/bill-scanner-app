// Bill list <-> bill detail, per browser tab (sessionStorage): the list's filters survive opening a
// bill and coming back, and the detail's previous / next / "save and next" / approve walk the bills
// exactly as the list showed them (filters, search, order). Storage can fail (private mode): then the
// list starts unfiltered and the detail falls back to the event's whole list.
export type BillListFilters = { status: string | null; paid: "paid" | "unpaid" | null; search: string; columns: Record<string, string[]>; payment?: string | null; sort?: { col: string; dir: "asc" | "desc" } | null };

const filtersKey = (eventId: string) => `bills-filters:${eventId}`;
const orderKey = (eventId: string) => `bills-order:${eventId}`;

function read<T>(key: string): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const readListFilters = (eventId: string) => read<BillListFilters>(filtersKey(eventId));
export const saveListFilters = (eventId: string, f: BillListFilters) => write(filtersKey(eventId), f);
export const saveListOrder = (eventId: string, ids: string[]) => write(orderKey(eventId), ids);

/** Previous / next bill as the list showed them; null when this bill isn't in the remembered list. */
export function adjacentInList(eventId: string, billId: string): { prev: string | null; next: string | null } | null {
  const ids = read<string[]>(orderKey(eventId));
  const i = ids ? ids.indexOf(billId) : -1;
  if (!ids || i < 0) return null;
  return { prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null };
}
