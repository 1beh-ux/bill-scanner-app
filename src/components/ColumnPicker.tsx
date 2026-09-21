"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";

export type ColumnOption = { key: string; label: string };

// "Columns" dropdown for a list: tick to show/hide, drag to reorder, an
// unticked list ("not shown") below. Shared by the participants list and the
// bills list. `required` keys can be moved but never hidden. `onSave` persists
// the ordered keys (per event, by the caller); `onReset` (optional) shows a
// "restore default" button that clears the saved choice.
export default function ColumnPicker({
  options,
  shown,
  required = [],
  labels,
  onSave,
  onReset,
}: {
  options: ColumnOption[];
  /** Currently displayed keys, in order. */
  shown: string[];
  required?: string[];
  labels: { button: string; title: string; dragHint: string; notShown: string; reset?: string };
  onSave: (keys: string[]) => Promise<void>;
  onReset?: () => Promise<void>;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const byKey = new Map(options.map((o) => [o.key, o]));
  const hidden = options.filter((o) => !order.includes(o.key));

  async function run(action: () => Promise<void>) {
    setSaving(true);
    await action();
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOrder(shown);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
      >
        {labels.button}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-mist bg-paper-2 p-3 shadow-lg">
          <p className="mb-1 text-[12px] font-medium text-ink-secondary">{labels.title}</p>
          <p className="mb-2 text-[11px] text-ink-secondary">{labels.dragHint}</p>
          <ul className="mb-1 flex flex-col gap-0.5">
            {order.map((key, i) => {
              const opt = byKey.get(key);
              if (!opt) return null;
              const isRequired = required.includes(key);
              return (
                <li
                  key={key}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === i) return;
                    setOrder((prev) => {
                      const next = [...prev];
                      const [moved] = next.splice(dragIndex, 1);
                      next.splice(i, 0, moved);
                      return next;
                    });
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={
                    "flex cursor-grab items-center gap-2 rounded px-1 py-1 text-[13px] text-ink active:cursor-grabbing " +
                    (dragIndex === i ? "opacity-40" : "hover:bg-paper")
                  }
                >
                  <span className="select-none text-ink-secondary">⠿</span>
                  <input
                    type="checkbox"
                    checked
                    disabled={isRequired}
                    onChange={() => setOrder((prev) => prev.filter((k) => k !== key))}
                  />
                  <span className="flex-1">{opt.label}</span>
                </li>
              );
            })}
          </ul>
          {hidden.length > 0 && (
            <>
              <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{labels.notShown}</p>
              <ul className="mb-3 flex flex-col gap-0.5">
                {hidden.map((o) => (
                  <li key={o.key} className="flex items-center gap-2 px-1 py-1 text-[13px] text-ink-secondary">
                    <span className="select-none opacity-30">⠿</span>
                    <input type="checkbox" checked={false} onChange={() => setOrder((prev) => [...prev, o.key])} />
                    <span className="flex-1">{o.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center justify-between gap-2">
            {onReset && labels.reset ? (
              <button type="button" disabled={saving} onClick={() => run(onReset)} className="text-[13px] text-ink-secondary hover:underline disabled:opacity-50">
                {labels.reset}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => run(() => onSave(order))}
                className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
              >
                {saving ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
