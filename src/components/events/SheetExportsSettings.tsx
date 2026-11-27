"use client";

import { useEffect, useState } from "react";
import { conditionLabel, type AutomationView } from "@/components/events/AutomationSettings";

// Nastavení akce -> Připojení (2026-11-27, src/lib/sheet-export.ts): Google Sheets kept up to date from the app --
// participants or bills, the chosen columns in order, on a schedule and/or when participants reach a condition.
type T = (key: string, vars?: Record<string, string>) => string;
type Column = { key: string; label: string };
type Export = { id: string; name: string; kind: "participants" | "bills"; sheetUrl: string | null; columns: string[]; everyHours: number | null; dailyAt: string | null; conditions: string[]; active: boolean; lastRunAt: string | null; lastError: string | null };
type View = AutomationView & { exports: Export[]; columns: { participants: Column[]; bills: Column[] } };
type Draft = { id?: string; name: string; kind: "participants" | "bills"; sheetUrl: string; columns: string[]; schedule: "none" | "hours" | "daily"; everyHours: number; dailyAt: string; conditions: string[]; active: boolean };

const input = "rounded-lg border border-mist bg-paper px-2 py-1 text-[13px] text-ink";
const btn = "rounded-lg border border-mist px-3 py-1 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const empty = (): Draft => ({ name: "", kind: "participants", sheetUrl: "", columns: [], schedule: "none", everyHours: 6, dailyAt: "06:00", conditions: [], active: true });

export default function SheetExportsSettings({ eventId, t }: { eventId: string; t: T }) {
  const url = `/api/events/${eventId}/automation`;
  const [data, setData] = useState<View | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [url]);

  async function post(body: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage(t("automation.failed"));
      return null;
    }
    const d = await res.json();
    setData(d);
    return d as View & { run?: { ok: boolean; rows?: number; error?: string } };
  }

  if (!data) return null;
  const all = draft ? data.columns[draft.kind] : [];
  const chosen = draft ? (draft.columns.length ? draft.columns : all.map((c) => c.key)) : [];
  const label = (k: string) => all.find((c) => c.key === k)?.label ?? k;
  const move = (i: number, d: -1 | 1) => {
    if (!draft) return;
    const next = [...chosen];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, columns: next });
  };
  const edit = (x: Export) =>
    setDraft({ id: x.id, name: x.name, kind: x.kind, sheetUrl: x.sheetUrl ?? "", columns: x.columns, schedule: x.everyHours ? "hours" : x.dailyAt ? "daily" : "none", everyHours: x.everyHours ?? 6, dailyAt: x.dailyAt ?? "06:00", conditions: x.conditions, active: x.active });
  const condOf = (key: string) => data.conditions.find((c) => c.key === key);

  return (
    <section className="rounded-lg border border-mist p-3">
      <h3 className="text-[15px] font-semibold text-ink">{t("sheetExports.title")}</h3>
      <p className="mb-2 text-[12.5px] text-ink-secondary">{t("sheetExports.hint")}</p>
      {message && <p className="mb-2 text-[12.5px] text-ink">{message}</p>}

      {data.exports.map((x) => (
        <div key={x.id} className="flex flex-wrap items-center gap-2 border-b border-mist/60 py-1.5 text-[13px] last:border-0">
          <span className="font-medium text-ink">{x.name}</span>
          <span className="text-[12px] text-ink-secondary">
            {t(`sheetExports.kind.${x.kind}`)} · {x.everyHours ? t("sheetExports.everyHoursShort", { n: String(x.everyHours) }) : x.dailyAt ? t("sheetExports.dailyShort", { time: x.dailyAt }) : t("sheetExports.noSchedule")}
            {x.conditions.length > 0 && ` · ${x.conditions.map((c) => (condOf(c) ? conditionLabel(condOf(c)!, t) : c)).join(", ")}`}
            {!x.active && ` · ${t("sheetExports.paused")}`}
          </span>
          {x.lastRunAt && <span className="text-[12px] text-ink-secondary">{t("sheetExports.lastRun", { date: new Date(x.lastRunAt).toLocaleString("cs-CZ") })}</span>}
          {x.lastError && <span className="text-[12px] text-red-600">{t("sheetExports.error", { code: x.lastError })}</span>}
          <span className="ml-auto flex gap-2">
            {x.sheetUrl && (
              <a href={x.sheetUrl} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                {t("sheetExports.open")} ↗
              </a>
            )}
            <button type="button" disabled={busy} onClick={async () => { const d = await post({ action: "runExport", id: x.id }); if (d?.run) setMessage(d.run.ok ? t("sheetExports.ran", { n: String(d.run.rows ?? 0) }) : t("sheetExports.error", { code: d.run.error ?? "" })); }} className="text-ember hover:underline">
              {t("sheetExports.runNow")}
            </button>
            <button type="button" onClick={() => edit(x)} className="text-ember hover:underline">{t("sheetExports.edit")}</button>
            <button type="button" disabled={busy} onClick={() => confirm(t("sheetExports.deleteConfirm")) && post({ action: "deleteExport", id: x.id })} className="text-red-600 hover:underline">{t("common.delete")}</button>
          </span>
        </div>
      ))}
      {!draft && (
        <button type="button" onClick={() => setDraft(empty())} className={btn + " mt-2"}>
          + {t("sheetExports.add")}
        </button>
      )}

      {draft && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg bg-paper-2 p-3 text-[13px]">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-0.5">
              {t("sheetExports.name")}
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} placeholder={t("sheetExports.namePlaceholder")} />
            </label>
            <label className="flex flex-col gap-0.5">
              {t("sheetExports.what")}
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"], columns: [], conditions: [] })} className={input}>
                <option value="participants">{t("sheetExports.kind.participants")}</option>
                <option value="bills">{t("sheetExports.kind.bills")}</option>
              </select>
            </label>
            <label className="flex min-w-[16rem] flex-1 flex-col gap-0.5">
              {t("sheetExports.sheet")}
              <input value={draft.sheetUrl} onChange={(e) => setDraft({ ...draft, sheetUrl: e.target.value })} className={input} placeholder={t("sheetExports.sheetPlaceholder")} />
            </label>
          </div>

          <div>
            <p className="mb-1 font-medium text-ink">{t("sheetExports.columns")}</p>
            <p className="mb-1 text-[12px] text-ink-secondary">{t("sheetExports.columnsHint")}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                {chosen.map((k, i) => (
                  <div key={k} className="flex items-center gap-1 rounded border border-mist bg-paper px-2 py-0.5">
                    <span className="w-5 text-right text-[11px] text-ink-secondary">{i + 1}.</span>
                    <span className="flex-1">{label(k)}</span>
                    <button type="button" onClick={() => move(i, -1)} aria-label="↑" className="px-1 text-ink-secondary hover:text-ink">↑</button>
                    <button type="button" onClick={() => move(i, 1)} aria-label="↓" className="px-1 text-ink-secondary hover:text-ink">↓</button>
                    <button type="button" onClick={() => setDraft({ ...draft, columns: chosen.filter((x) => x !== k) })} aria-label="×" className="px-1 text-red-600">×</button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-0.5">
                {all.filter((c) => !chosen.includes(c.key)).map((c) => (
                  <button key={c.key} type="button" onClick={() => setDraft({ ...draft, columns: [...chosen, c.key] })} className="rounded border border-dashed border-mist px-2 py-0.5 text-left text-ink-secondary hover:bg-paper">
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{t("sheetExports.when")}</span>
            <select value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value as Draft["schedule"] })} className={input}>
              <option value="none">{t("sheetExports.scheduleNone")}</option>
              <option value="hours">{t("sheetExports.scheduleHours")}</option>
              <option value="daily">{t("sheetExports.scheduleDaily")}</option>
            </select>
            {draft.schedule === "hours" && <input type="number" min={1} max={168} value={draft.everyHours} onChange={(e) => setDraft({ ...draft, everyHours: Number(e.target.value) })} className={input + " w-20"} />}
            {draft.schedule === "daily" && <input type="time" value={draft.dailyAt} onChange={(e) => setDraft({ ...draft, dailyAt: e.target.value })} className={input} />}
          </div>
          {draft.kind === "participants" && (
            <div>
              <p className="mb-1 font-medium text-ink">{t("sheetExports.onConditions")}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {data.conditions.map((c) => (
                  <label key={c.key} className="flex items-center gap-1">
                    <input type="checkbox" checked={draft.conditions.includes(c.key)} onChange={(e) => setDraft({ ...draft, conditions: e.target.checked ? [...draft.conditions, c.key] : draft.conditions.filter((x) => x !== c.key) })} />
                    {conditionLabel(c, t)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            {t("sheetExports.activeLabel")}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={async () => {
                const d = await post({
                  action: "saveExport",
                  id: draft.id,
                  name: draft.name,
                  kind: draft.kind,
                  sheetUrl: draft.sheetUrl,
                  columns: draft.columns,
                  everyHours: draft.schedule === "hours" ? draft.everyHours : null,
                  dailyAt: draft.schedule === "daily" ? draft.dailyAt : null,
                  conditions: draft.conditions,
                  active: draft.active,
                });
                if (d) setDraft(null);
              }}
              className={btnPrimary}
            >
              {t("common.save")}
            </button>
            <button type="button" onClick={() => setDraft(null)} className={btn}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
