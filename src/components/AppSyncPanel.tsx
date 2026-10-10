"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTemplateLevel } from "@/lib/template-level";
import type { SyncStatus, TemplateTable } from "@/lib/app-templates";

// Organizace -> Šablony vs. Aplikace -> Šablony aplikace (organizations step 4):
// each item's badge (Výchozí / Upraveno / Vlastní), "Porovnat", "Obnovit z aplikace",
// and "Načíst nové z aplikace". Shown on the organization level only; changes there
// never reach the app templates, and app changes never reach an organization by themselves.
type Item = { id: string; label: string; status: SyncStatus; diff: { field: string; current: unknown; app: unknown }[] };

const BADGE: Record<SyncStatus, string> = {
  default: "bg-pine-bg text-pine",
  modified: "bg-ember/15 text-ember",
  custom: "bg-paper-2 text-ink-secondary",
};
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** Wraps one template section: the section reloads (remounts) after a restore/load. */
export function Synced({ table, filter, children }: { table: TemplateTable; filter?: string; children: React.ReactNode }) {
  const level = useTemplateLevel();
  const [version, setVersion] = useState(0);
  if (level === "app") return <>{children}</>;
  return (
    <div>
      <div key={version}>{children}</div>
      <AppSyncPanel table={table} filter={filter} onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
}

export default function AppSyncPanel({ table, filter, onChanged }: { table: TemplateTable; filter?: string; onChanged: () => void }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = `table=${table}${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`;

  const load = useCallback(
    () =>
      fetch(`/api/app-templates?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Item[] | null) => setItems(data))
        .catch(() => {}),
    [query]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/app-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, ...body }) });
    setBusy(false);
    return res.ok ? res.json() : null;
  }

  async function pull() {
    setMessage(null);
    const data = await post({ action: "pull", filter });
    if (!data) return;
    setMessage(data.created > 0 ? t("appSync.pulled", { count: String(data.created) }) : t("appSync.nothingNew"));
    await load();
    if (data.created > 0) onChanged();
  }

  async function restore(item: Item) {
    if (!(await confirm({ message: t("appSync.restoreConfirm", { name: item.label }), confirmLabel: t("appSync.restore") }))) return;
    if (!(await post({ action: "restore", id: item.id }))) return;
    setCompare(null);
    await load();
    onChanged();
  }

  if (!items) return null;
  const count = (s: SyncStatus) => items.filter((i) => i.status === s).length;
  return (
    <div className="mt-3 rounded-lg border border-mist bg-paper-2/40 px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink-secondary">{t("appSync.title")}</span>
        <span className="text-ink-secondary">
          {t("appSync.summary", { def: String(count("default")), mod: String(count("modified")), own: String(count("custom")) })}
        </span>
        {items.length > 0 && (
          <button type="button" className="text-ember hover:underline" onClick={() => setOpen(!open)}>
            {open ? t("appSync.hide") : t("appSync.show")}
          </button>
        )}
        <button type="button" disabled={busy} className="text-ember hover:underline disabled:opacity-50" onClick={pull}>
          {t("appSync.pull")}
        </button>
        {message && <span className="text-ink">{message}</span>}
      </div>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={"rounded-full px-2 py-0.5 text-[11.5px] " + BADGE[item.status]}>{t(`appSync.status.${item.status}`)}</span>
                <span className="text-ink">{item.label}</span>
                {item.status === "modified" && (
                  <>
                    <button type="button" className="text-ember hover:underline" onClick={() => setCompare(compare === item.id ? null : item.id)}>
                      {compare === item.id ? t("appSync.hideCompare") : t("appSync.compare")}
                    </button>
                    <button type="button" disabled={busy} className="text-ember hover:underline disabled:opacity-50" onClick={() => restore(item)}>
                      {t("appSync.restore")}
                    </button>
                  </>
                )}
              </div>
              {compare === item.id && (
                <table className="mt-1 w-full text-[12px]">
                  <thead className="text-ink-secondary">
                    <tr>
                      <th className="py-1 pr-2 text-left font-medium">{t("appSync.colField")}</th>
                      <th className="py-1 pr-2 text-left font-medium">{t("appSync.colOrg")}</th>
                      <th className="py-1 text-left font-medium">{t("appSync.colApp")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.diff.map((d) => (
                      <tr key={d.field} className="border-t border-mist align-top">
                        <td className="py-1 pr-2 font-mono text-ink-secondary">{d.field}</td>
                        <td className="whitespace-pre-wrap py-1 pr-2 text-ink [overflow-wrap:anywhere]">{show(d.current)}</td>
                        <td className="whitespace-pre-wrap py-1 text-ink [overflow-wrap:anywhere]">{show(d.app)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
