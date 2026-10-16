"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import HelpLink from "@/components/HelpLink";
import { driveErrorText } from "@/lib/drive-error-messages";
import type { CleanupRow } from "@/lib/drive-cleanup";

// Úklid souborů na Disku (src/lib/drive-cleanup.ts): scan folders, see which files bills use and
// which are duplicates, move the confirmed ones to a cleaned folder / duplicates to the Drive bin.
type Scan = { folders: { id: string; name: string | null; error: string | null; files: number }[]; rows: CleanupRow[]; skipped: { name: string; folderPath: string }[]; truncated: boolean };
const FILTERS = ["all", "used", "unused", "duplicates", "trash", "elsewhere"] as const;
const input = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink";
const btn = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const kb = (n: number | null) => (n === null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);
const czk = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`);

export default function DriveCleanupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [folders, setFolders] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [target, setTarget] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, { ok: boolean; error?: string; action: string }>>(new Map());

  // The event's Zpracované soubory folder is the default target.
  useEffect(() => {
    fetch(`/api/events/${id}`).then((r) => (r.ok ? r.json() : null)).then((ev) => ev?.driveProcessedFolderId && setTarget((x) => x || ev.driveProcessedFolderId)).catch(() => {});
  }, [id]);

  async function runScan() {
    setBusy(true);
    setError(null);
    setResults(new Map());
    const r = await fetch(`/api/events/${id}/drive-cleanup/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folders: folders.split(/[\s,]+/).filter(Boolean), recursive }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(t("driveCleanup.scanFailed"));
    const d: Scan = await r.json();
    setScan(d);
    // Pre-select what the scan proposes: used files to move, extra duplicate copies to the bin.
    setSelected(new Set(d.rows.filter((x) => x.proposed !== "none").map((x) => x.fileId)));
  }

  const rows = useMemo(() => {
    const all = scan?.rows ?? [];
    switch (filter) {
      case "used": return all.filter((r) => r.matches.length);
      case "unused": return all.filter((r) => !r.matches.length);
      case "duplicates": return all.filter((r) => r.duplicateGroup);
      case "trash": return all.filter((r) => r.proposed === "trash");
      case "elsewhere": return all.filter((r) => r.matches.some((m) => m.eventId !== id) || r.billInSeveralEvents);
      default: return all;
    }
  }, [scan, filter, id]);
  const count = (f: (typeof FILTERS)[number]) => (scan ? { all: scan.rows.length, used: scan.rows.filter((r) => r.matches.length).length, unused: scan.rows.filter((r) => !r.matches.length).length, duplicates: scan.rows.filter((r) => r.duplicateGroup).length, trash: scan.rows.filter((r) => r.proposed === "trash").length, elsewhere: scan.rows.filter((r) => r.matches.some((m) => m.eventId !== id) || r.billInSeveralEvents).length }[f] : 0);

  async function apply(kind: "move" | "trash") {
    const chosen = (scan?.rows ?? []).filter((r) => selected.has(r.fileId) && !results.get(r.fileId)?.ok);
    if (!chosen.length) return;
    if (kind === "move" && !target.trim()) return setError(t("driveCleanup.noTarget"));
    const unused = chosen.filter((r) => !r.matches.length && !r.duplicateGroup).length;
    const q = kind === "move" ? t("driveCleanup.moveConfirm", { count: String(chosen.length), unused: String(unused) }) : t("driveCleanup.trashConfirm", { count: String(chosen.length), keepers: String(chosen.filter((r) => r.keeper || (!r.duplicateGroup && r.matches.length)).length) });
    if (!(await confirm({ message: q, danger: kind === "trash" }))) return;
    setBusy(true);
    setError(null);
    const next = new Map(results);
    for (let i = 0; i < chosen.length; i += 100) {
      const batch = chosen.slice(i, i + 100);
      const r = await fetch(`/api/events/${id}/drive-cleanup/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetFolder: target, actions: batch.map((x) => ({ fileId: x.fileId, folderId: x.folderId, action: kind })) }) }).catch(() => null);
      const d = r?.ok ? await r.json() : { results: batch.map((x) => ({ fileId: x.fileId, ok: false, error: "drive_unknown" })) };
      for (const x of d.results as { fileId: string; ok: boolean; error?: string }[]) next.set(x.fileId, { ...x, action: kind });
      setResults(new Map(next));
    }
    setBusy(false);
  }

  const toggle = (fid: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(fid); else n.delete(fid); return n; });
  const done = [...results.values()];

  return (
    <div className="mx-auto max-w-[1300px] p-4 md:p-8">
      <a href={`/events/${id}/bills`} className="text-[13px] text-ink-secondary hover:text-ink">← {t("billsPage.title")}</a>
      <h1 className="mb-1 mt-2 flex items-center gap-2 text-[22px] font-semibold text-ink">{t("driveCleanup.title")} <HelpLink slug="uctenky" /></h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("driveCleanup.hint")}</p>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="text-[13px] text-ink-secondary">
          {t("driveCleanup.folders")}
          <textarea rows={4} value={folders} onChange={(e) => setFolders(e.target.value)} placeholder={t("driveCleanup.foldersPlaceholder")} className={input + " mt-1 font-mono text-[12.5px]"} />
          <span className="mt-1 flex items-center gap-2"><input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} />{t("driveCleanup.recursive")}</span>
        </label>
        <label className="text-[13px] text-ink-secondary">
          {t("driveCleanup.target")}
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t("driveCleanup.targetPlaceholder")} className={input + " mt-1"} />
          <span className="mt-1 block text-[11.5px]">{t("driveCleanup.targetHint")}</span>
        </label>
      </div>
      <button type="button" className={btnPrimary} disabled={busy || !folders.trim()} onClick={runScan}>{busy && !scan ? t("driveCleanup.scanning") : t("driveCleanup.scan")}</button>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      {scan && (
        <>
          <div className="mt-4 flex flex-col gap-1 text-[13px]">
            {scan.folders.map((f) => (
              <p key={f.id} className={f.error ? "text-red-600" : "text-ink-secondary"}>
                {f.error ? `${f.id}: ${driveErrorText(t, f.error, {})}` : t("driveCleanup.folderLine", { name: f.name ?? f.id, count: String(f.files) })}
              </p>
            ))}
            {scan.truncated && <p className="text-amber-700">{t("driveCleanup.truncated")}</p>}
            {scan.skipped.length > 0 && <p className="text-ink-secondary">{t("driveCleanup.skippedNative", { count: String(scan.skipped.length) })}</p>}
          </div>

          <div className="mb-3 mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={"rounded-full px-2.5 py-0.5 text-[12.5px] " + (filter === f ? "bg-ember text-white" : "bg-paper-2 text-ink-secondary")}>{t(`driveCleanup.filter.${f}`)} ({count(f)})</button>
            ))}
          </div>

          <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-2 border-b border-mist bg-paper py-2 text-[13px]">
            <span className="text-ink">{t("driveCleanup.selected", { count: String(selected.size) })}</span>
            <button type="button" className={btn} onClick={() => setSelected(new Set(rows.map((r) => r.fileId)))}>{t("driveCleanup.selectShown")}</button>
            <button type="button" className={btn} onClick={() => setSelected(new Set((scan?.rows ?? []).filter((r) => r.proposed !== "none").map((r) => r.fileId)))}>{t("driveCleanup.selectProposed")}</button>
            <button type="button" className={btn} onClick={() => setSelected(new Set())}>{t("billsPage.clearSelection")}</button>
            <button type="button" className={btnPrimary} disabled={busy || !selected.size} onClick={() => apply("move")}>{t("driveCleanup.move")}</button>
            <button type="button" className="rounded-lg border border-red-300 px-3 py-1.5 text-[13px] text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy || !selected.size} onClick={() => apply("trash")}>{t("driveCleanup.trash")}</button>
            {done.length > 0 && <span className="text-ink-secondary">{t("driveCleanup.resultLine", { ok: String(done.filter((x) => x.ok).length), failed: String(done.filter((x) => !x.ok).length) })}</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-mist text-left text-ink-secondary">
                  <th className="w-8 p-1.5" />
                  <th className="p-1.5 font-medium">{t("driveCleanup.colFile")}</th>
                  <th className="p-1.5 font-medium">{t("driveCleanup.colFolder")}</th>
                  <th className="p-1.5 font-medium">{t("driveCleanup.colUsedBy")}</th>
                  <th className="p-1.5 font-medium">{t("driveCleanup.colProposed")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const res = results.get(r.fileId);
                  return (
                    <tr key={r.fileId} className={"border-b border-mist/60 align-top " + (res?.ok ? "opacity-50" : "")}>
                      <td className="p-1.5"><input type="checkbox" disabled={!!res?.ok} checked={selected.has(r.fileId)} onChange={(e) => toggle(r.fileId, e.target.checked)} aria-label={r.name} /></td>
                      <td className="p-1.5 [overflow-wrap:anywhere]">
                        {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="text-ember hover:underline">{r.name}</a> : r.name}
                        <span className="block text-[11.5px] text-ink-secondary">{kb(r.size)}{r.modifiedTime && ` · ${new Date(r.modifiedTime).toLocaleDateString("cs-CZ")}`}</span>
                        {r.duplicateGroup && <span className={"mt-0.5 inline-block rounded px-1.5 text-[11px] " + (r.keeper ? "bg-pine-bg text-pine" : "bg-amber-100 text-amber-800")}>{r.keeper ? t("driveCleanup.dupKeep") : t("driveCleanup.dupCopy")} · {r.duplicateGroup}</span>}
                      </td>
                      <td className="p-1.5 text-ink-secondary [overflow-wrap:anywhere]">{r.folderPath}</td>
                      <td className="p-1.5">
                        {r.matches.length === 0 && <span className="text-ink-secondary">{t("driveCleanup.unused")}</span>}
                        {r.matches.map((m) => (
                          <div key={m.billId} className="mb-0.5">
                            {m.accessible ? (
                              <a href={`/events/${m.eventId}/bills/${m.billId}`} target="_blank" rel="noreferrer" className="text-ink hover:underline">{m.merchant ?? m.displayFilename ?? t("driveCleanup.bill")}</a>
                            ) : (
                              <span className="text-ink-secondary">{t("driveCleanup.billElsewhere")}</span>
                            )}
                            <span className="text-ink-secondary"> · {m.eventName}</span>
                            {m.accessible && (
                              <span className="block text-[11.5px] text-ink-secondary">
                                {t(`billsPage.status${m.status === "auto_approved" ? "AutoApproved" : m.status === "to_review" ? "ToReview" : (m.status ?? "").charAt(0).toUpperCase() + (m.status ?? "").slice(1)}`)}
                                {m.billDate && ` · ${new Date(m.billDate).toLocaleDateString("cs-CZ")}`}{m.amountCzk !== undefined && ` · ${czk(m.amountCzk)}`}
                                {m.paid && m.paid !== "none" && ` · ${t(m.paid === "paid" ? "billsPage.paidYes" : "billsPage.paidNo")}`}
                                {m.payment && ` · ${t(`paymentState.${m.payment}`)}`}
                                {` · ${t(`driveCleanup.via.${m.via}`)}`}
                              </span>
                            )}
                          </div>
                        ))}
                        {r.billInSeveralEvents && <span className="text-[11.5px] text-amber-700">{t("driveCleanup.severalEvents")}</span>}
                      </td>
                      <td className="p-1.5">
                        <span className={"rounded-full px-2 py-0.5 text-[12px] " + (r.proposed === "move" ? "bg-pine-bg text-pine" : r.proposed === "trash" ? "bg-amber-100 text-amber-800" : "bg-paper-2 text-ink-secondary")}>{t(`driveCleanup.proposed.${r.proposed}`)}</span>
                        {res && <span className={"mt-1 block text-[11.5px] " + (res.ok ? "text-pine" : "text-red-600")}>{res.ok ? t(`driveCleanup.done.${res.action}`) : driveErrorText(t, res.error ?? "drive_unknown", {})}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
