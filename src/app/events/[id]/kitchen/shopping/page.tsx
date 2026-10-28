"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { formatQty } from "@/lib/kitchen/sizing";
import { NoAccess, Qty, btn, fmtDay, send } from "@/components/kitchen/ui";

// Nákup: what the plan needs, per day of use, grouped by where it's bought (store hint) and category;
// tick it off while shopping. CSV / print. Totals only -- no prices, no pack sizes (phase 1).
type Line = { ingredientId: string; name: string; unit: string; qty: number; storeHint: string | null; category: string | null; meals: string[]; checked: boolean; qtyBought: number | null };
type Data = { event: { name: string }; days: { date: string; lines: Line[] }[] };

export default function KitchenShoppingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const url = `/api/events/${id}/kitchen/shopping`;
  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  async function tick(date: string, l: Line, checked: boolean) {
    setData((d) => d && { ...d, days: d.days.map((x) => (x.date !== date ? x : { ...x, lines: x.lines.map((y) => (y.ingredientId === l.ingredientId ? { ...y, checked } : y)) })) });
    await send(url, "PUT", { ingredientId: l.ingredientId, forDate: date, checked });
  }
  function csv() {
    if (!data) return;
    const rows = [[t("kitchen.shopping.day"), t("kitchen.shopping.store"), t("kitchen.shopping.category"), t("kitchen.shopping.item"), t("kitchen.shopping.qty"), t("kitchen.shopping.unit"), t("kitchen.shopping.meals"), t("kitchen.shopping.bought")]];
    for (const d of data.days)
      for (const l of d.lines) {
        const f = formatQty(l.qty, l.unit as "g" | "ml" | "ks");
        rows.push([d.date, l.storeHint ?? "", l.category ?? "", l.name, f.value, f.unit, l.meals.join(", "), l.checked ? "ano" : ""]);
      }
    const text = "﻿" + rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = `nakup-${data.event.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (denied) return <NoAccess />;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">
        {t("kitchen.navShopping")} <span className="text-[15px] font-normal text-ink-secondary">· {data.event.name}</span>
      </h1>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-secondary print:hidden">{t("kitchen.shopping.hint")}</p>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <button type="button" onClick={csv} className={btn}>
          {t("kitchen.shopping.csv")}
        </button>
        <button type="button" onClick={() => window.print()} className={btn}>
          {t("kitchen.print")}
        </button>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          {t("kitchen.shopping.hideDone")}
        </label>
      </div>
      {data.days.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.shopping.empty")}</p>}
      {data.days.map((d) => {
        const lines = d.lines.filter((l) => !hideDone || !l.checked);
        const groups = new Map<string, Line[]>();
        for (const l of lines) groups.set(l.storeHint ?? "", [...(groups.get(l.storeHint ?? "") ?? []), l]);
        return (
          <section key={d.date} className="mb-6 break-inside-avoid">
            <h2 className="mb-1 text-[16px] font-semibold text-ink">
              {fmtDay(d.date, lang)} <span className="text-[12.5px] font-normal text-ink-secondary">{t("kitchen.shopping.done", { n: String(d.lines.filter((l) => l.checked).length), total: String(d.lines.length) })}</span>
            </h2>
            {[...groups].map(([store, ls]) => (
              <div key={store} className="mb-2">
                <h3 className="text-[12.5px] font-medium uppercase tracking-wide text-ink-secondary">{store || t("kitchen.shopping.anyStore")}</h3>
                {ls.map((l) => (
                  <label key={l.ingredientId} className={"flex items-start gap-2 py-1 text-[14px] " + (l.checked ? "text-ink-secondary line-through" : "text-ink")}>
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={l.checked} onChange={(e) => tick(d.date, l, e.target.checked)} />
                    <span className="flex-1">
                      {l.name}
                      {l.category && <span className="ml-1 text-[11.5px] text-ink-secondary">({l.category})</span>}
                      <span className="block text-[11.5px] text-ink-secondary">{l.meals.join(", ")}</span>
                    </span>
                    <span className="font-medium">
                      <Qty q={l.qty} unit={l.unit} />
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
