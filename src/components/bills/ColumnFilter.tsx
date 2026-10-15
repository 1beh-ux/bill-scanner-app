"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListFilter } from "lucide-react";

// Excel-like column filter (bill list): the column's values with checkboxes, a search box and
// "(Vybrat vše)". selected = null -> no filter (everything shown).
type T = (key: string, vars?: Record<string, string>) => string;

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ColumnFilter({ values, selected, onChange, t }: { values: { value: string; count: number }[]; selected: Set<string> | null; onChange: (next: Set<string> | null) => void; t: T }) {
  // Fixed position under the button: the table scrolls sideways (overflow-x) and would clip it.
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(null);
    };
    const away = () => setOpen(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away);
    };
  }, [open]);

  const shown = useMemo(() => (search.trim() ? values.filter((v) => fold(v.value).includes(fold(search.trim()))) : values), [values, search]);
  const isOn = (v: string) => !selected || selected.has(v);
  const allShownOn = shown.every((v) => isOn(v.value));
  const active = selected !== null;

  // A full selection is no filter at all.
  const commit = (next: Set<string>) => onChange(values.every((v) => next.has(v.value)) ? null : next);
  const toggle = (v: string) => {
    const next = new Set(selected ?? values.map((x) => x.value));
    if (next.has(v)) next.delete(v);
    else next.add(v);
    commit(next);
  };
  const toggleAllShown = () => {
    const next = new Set(selected ?? values.map((x) => x.value));
    for (const v of shown) {
      if (allShownOn) next.delete(v.value);
      else next.add(v.value);
    }
    commit(next);
  };

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          setOpen({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) });
        }}
        aria-label={t("billFilter.button")}
        title={t("billFilter.button")}
        className={"ml-1 rounded p-0.5 align-middle " + (active ? "bg-ember text-white" : "text-ink-secondary hover:bg-paper-2 hover:text-ink")}
      >
        <ListFilter size={13} aria-hidden="true" />
      </button>
      {open && (
        <div style={{ top: open.top, left: open.left }} className="fixed z-40 flex w-64 flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-2 text-[13px] font-normal text-ink shadow-lg">
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("billFilter.search")} className="rounded border border-mist bg-paper px-2 py-1 text-[13px]" />
          <label className="flex items-center gap-2 border-b border-mist pb-1 font-medium">
            <input type="checkbox" checked={allShownOn} onChange={toggleAllShown} />
            {search.trim() ? t("billFilter.selectAllShown") : t("billFilter.selectAll")}
          </label>
          <ul className="scrollbar-app max-h-64 overflow-y-auto">
            {shown.map((v) => (
              <li key={v.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-paper">
                  <input type="checkbox" checked={isOn(v.value)} onChange={() => toggle(v.value)} />
                  <span className="flex-1 [overflow-wrap:anywhere]">{v.value}</span>
                  <span className="text-[11px] text-ink-secondary">{v.count}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-1 text-ink-secondary">{t("billFilter.noValues")}</li>}
          </ul>
          {active && (
            <button type="button" onClick={() => onChange(null)} className="self-start text-ember hover:underline">
              {t("billFilter.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
