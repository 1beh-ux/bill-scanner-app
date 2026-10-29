"use client";

import { useEffect, useState } from "react";
import ColumnFilter from "@/components/bills/ColumnFilter";
import { nextSort, sortBy, type SortDir, type SortValue } from "@/lib/bill-sort";

// Excel-like sorting + filtering for a list's columns (Zdraví, Účastníci), the bill list's ColumnFilter
// reused: a click on the title sorts (A→Z, Z→A, off), the small funnel filters by the column's values
// (offered from the rows the other filters leave, like Excel). Kept per tab in sessionStorage, so coming
// back from a detail keeps the list as it was.
export type FilterCol<T> = { key: string; text: (row: T) => string; sort?: (row: T) => SortValue };
type T = (key: string, vars?: Record<string, string>) => string;
type Saved = { sort: { col: string; dir: SortDir } | null; filters: Record<string, string[]> };

export function useTableFilter<R>(rows: R[], cols: FilterCol<R>[], storageKey: string, t: T) {
  const [sort, setSort] = useState<Saved["sort"]>(null);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Saved | null;
      if (s) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the tab's saved state once
        setSort(s.sort);
        setFilters(Object.fromEntries(Object.entries(s.filters).map(([k, v]) => [k, new Set(v)])));
      }
    } catch {}
  }, [storageKey]);
  const save = (next: Saved) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };
  const filtersJson = () => Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, [...v]]));

  const col = (key: string) => cols.find((c) => c.key === key);
  const passes = (r: R, except?: string) => Object.entries(filters).every(([k, set]) => k === except || !col(k) || set.has(col(k)!.text(r)));
  // ponytail: recomputed every render (lists of a few hundred rows); memoize if a list grows into thousands.
  const kept = rows.filter((r) => passes(r));
  const sortCol = sort ? col(sort.col) : undefined;
  const out = sortCol ? sortBy(kept, sortCol.sort ?? sortCol.text, sort!.dir) : kept;

  function values(key: string) {
    const c = col(key)!;
    const counts = new Map<string, number>();
    for (const r of rows) if (passes(r, key)) counts.set(c.text(r), (counts.get(c.text(r)) ?? 0) + 1);
    return sortBy([...counts].map(([value, count]) => ({ value, count })), (v) => (v.value === "—" ? null : v.value), "asc");
  }
  function setFilter(key: string, next: Set<string> | null) {
    const f = { ...filters };
    if (next) f[key] = next;
    else delete f[key];
    setFilters(f);
    save({ sort, filters: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, [...v]])) });
  }

  /** A column title: sort on click + the filter funnel. Small: the title's own size plus a 13px icon. */
  const header = (key: string, label: React.ReactNode) => (
    <span className="inline-flex items-center whitespace-nowrap">
      <button
        type="button"
        onClick={() => {
          const s = nextSort(sort, key);
          setSort(s);
          save({ sort: s, filters: filtersJson() });
        }}
        title={t("billsPage.sortHint")}
        className={"hover:text-ink " + (sort?.col === key ? "text-ink" : "")}
      >
        {label}
        {sort?.col === key && <span aria-hidden="true"> {sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
      <ColumnFilter values={values(key)} selected={filters[key] ?? null} onChange={(next) => setFilter(key, next)} t={t} />
    </span>
  );

  const active = Object.keys(filters).length;
  const clear = () => {
    setFilters({});
    save({ sort, filters: {} });
  };
  return { rows: out, header, active, clear, sort };
}
