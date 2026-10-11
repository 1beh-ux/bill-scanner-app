"use client";

import { useCallback, useEffect, useState } from "react";
import BankCheckButton from "@/components/bank/BankCheckButton";

type Overview = {
  sheets: { id: string; name: string; sheetUrl: string; document: string | null; autoSync: boolean; lastAt: string | null; lastError: string | null }[];
  drive: { configured: boolean; enabled: boolean };
  statusSheet: { configured: boolean; enabled: boolean; url: string | null; lastAt: string | null };
};
type Result = { what: string; ok: boolean; detail?: string };

const when = (d: string | null) => (d ? new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" }) : null);
const btn = "rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";

/**
 * Účastníci -> Dokumenty: every connection that updates documents in one place --
 * "Synchronizovat dokumenty" (sheet connections, Drive copies, status sheet) and,
 * when the event checks the bank, "Zkontrolovat platby". onChanged reloads the list.
 */
export default function DocumentSyncPanel({ eventId, bankCheck, onChanged, t }: { eventId: string; bankCheck: boolean; onChanged: () => void; t: (key: string, vars?: Record<string, string>) => string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${eventId}/documents/sync`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  async function syncAll() {
    setBusy(true);
    setResults(null);
    const r = await fetch(`/api/events/${eventId}/documents/sync`, { method: "POST" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setBusy(false);
    if (!r) return setResults([{ what: "all", ok: false, detail: "failed" }]);
    setData(r);
    setResults(r.results);
    onChanged();
  }

  const label = (what: string) =>
    what.startsWith("sheet:") ? t("documentSync.sheet", { name: what.slice(6) }) : what === "drive" ? t("documentSync.drive") : what === "statusSheet" ? t("documentSync.statusSheet") : t("documentSync.all");

  return (
    <section className="mb-5 flex flex-col gap-3 rounded-lg border border-mist bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={syncAll} disabled={busy} className={btn}>
          {busy ? t("documentSync.running") : t("documentSync.button")}
        </button>
        {bankCheck && <BankCheckButton eventId={eventId} onSettled={onChanged} t={t} />}
      </div>
      {results && (
        <ul className="text-[12.5px]">
          {results.length === 0 && <li className="text-ink-secondary">{t("documentSync.nothingConnected")}</li>}
          {results.map((r) => (
            <li key={r.what} className={r.ok ? "text-pine" : "text-red-600"}>
              {label(r.what)}: {r.ok ? t("documentSync.ok") : t("documentSync.failed", { code: r.detail ?? "" })}
            </li>
          ))}
        </ul>
      )}
      {data && (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="font-medium text-ink">{t("documentSync.connections")}</p>
          {data.sheets.length === 0 && !data.drive.configured && !data.statusSheet.configured && <p className="text-ink-secondary">{t("documentSync.nothingConnected")}</p>}
          {data.sheets.map((s) => (
            <p key={s.id} className="text-ink-secondary [overflow-wrap:anywhere]">
              <a href={s.sheetUrl} target="_blank" rel="noreferrer" className="text-ink underline hover:text-ember">{s.name}</a>
              {" → "}
              {s.document ? t("documentSync.ticks", { document: s.document }) : t("documentSync.dataOnly")}
              {" · "}
              {s.lastError ? <span className="text-red-600">{t("documentSync.failed", { code: s.lastError })}</span> : s.lastAt ? t("documentSync.lastAt", { when: when(s.lastAt)! }) : t("documentSync.never")}
              {s.autoSync && ` · ${t("documentSync.auto")}`}
            </p>
          ))}
          {data.drive.configured && (
            <p className="text-ink-secondary">{t("documentSync.drive")} · {data.drive.enabled ? t("documentSync.on") : t("documentSync.off")}</p>
          )}
          {data.statusSheet.configured && (
            <p className="text-ink-secondary">
              {data.statusSheet.url ? <a href={data.statusSheet.url} target="_blank" rel="noreferrer" className="text-ink underline hover:text-ember">{t("documentSync.statusSheet")}</a> : t("documentSync.statusSheet")}
              {" · "}
              {data.statusSheet.enabled ? (data.statusSheet.lastAt ? t("documentSync.lastAt", { when: when(data.statusSheet.lastAt)! }) : t("documentSync.never")) : t("documentSync.off")}
            </p>
          )}
          <a href={`/events/${eventId}?tab=posta`} className="text-[12.5px] text-ember hover:underline">{t("documentSync.settingsLink")}</a>
        </div>
      )}
    </section>
  );
}
