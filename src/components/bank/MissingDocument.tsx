"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { dmy, kc } from "@/components/bank/bank-format";

// Bill detail, bill created from a payment without a document (docs/bank-reconciliation.md A8):
// drop / pick a file (stored, AI runs, pairing stays) or "Najít doklad" -- same-amount bills in other
// events, Drive import files not imported yet, or assign the missing document to a person.
type T = (key: string, vars?: Record<string, string>) => string;
type Found = { otherBills: { id: string; merchantName: string | null; billDate: string | null; amountCzk: number; originalFilename: string; eventName: string }[]; driveFiles: { id: string; name: string; folder: string }[]; driveError: string | null; hasDriveFolder: boolean; authors: { id: string; canonicalName: string }[]; assignee: string | null };
const btn = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function MissingDocument({ billId, fromStatement, locked, onChanged, t }: { billId: string; fromStatement: boolean; locked: boolean; onChanged: (newBillId?: string) => void; t: T }) {
  const confirm = useConfirm();
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/bills/${billId}/document`, { method: "POST", body: fd }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMsg(t(`missingDoc.error.${d.error ?? "failed"}`));
    onChanged();
  }
  async function act(body: object, question?: string) {
    if (question && !(await confirm({ message: question }))) return;
    setBusy(true);
    const r = await fetch(`/api/bills/${billId}/find-document`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMsg(t(`missingDoc.error.${d.error ?? "failed"}`));
    onChanged(d.billId);
  }

  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => (e.preventDefault(), setDrag(false), !locked && upload(e.dataTransfer.files?.[0]))}
      className={"flex min-h-[320px] flex-col gap-3 rounded-lg border-2 border-dashed p-4 text-[13px] " + (drag ? "border-ember bg-paper-2" : "border-mist")}
    >
      <p className="text-[15px] font-semibold text-ink">
        {fromStatement ? t("missingDoc.statementTitle") : t("missingDoc.title")}{" "}
        <span className={"rounded px-1.5 py-0.5 text-[11.5px] " + (fromStatement ? "bg-paper-2 text-ink-secondary" : "bg-amber-100 text-amber-800")}>{fromStatement ? t("missingDoc.badgeStatement") : t("missingDoc.badge")}</span>
      </p>
      <p className="text-ink-secondary">{fromStatement ? t("missingDoc.statementHint") : t("missingDoc.hint")}</p>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={btn + " cursor-pointer"}>
            {busy ? t("common.loading") : t("missingDoc.upload")}
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          </label>
          <button type="button" className={btn} disabled={busy} onClick={() => fetch(`/api/bills/${billId}/find-document`).then((r) => r.json()).then(setFound)}>{t("missingDoc.find")}</button>
        </div>
      )}
      {msg && <p className="text-red-600">{msg}</p>}
      {found && (
        <div className="flex flex-col gap-3">
          <section>
            <h4 className="mb-1 font-medium text-ink">{t("missingDoc.otherEvents")}</h4>
            {found.otherBills.length === 0 && <p className="text-ink-secondary">{t("missingDoc.noneFound")}</p>}
            {found.otherBills.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 border-b border-mist/60 py-1">
                <span>{b.merchantName ?? b.originalFilename} · {dmy(b.billDate)} · {kc(b.amountCzk)} · {b.eventName}</span>
                <button type="button" className={btn} disabled={busy} onClick={() => act({ action: "replace", billId: b.id }, t("missingDoc.replaceConfirm", { event: b.eventName }))}>{t("missingDoc.replace")}</button>
              </div>
            ))}
          </section>
          <section>
            <h4 className="mb-1 font-medium text-ink">{t("missingDoc.drive")}</h4>
            {!found.hasDriveFolder ? <p className="text-ink-secondary">{t("missingDoc.noDriveFolder")}</p> : found.driveError ? <p className="text-amber-700">{t("missingDoc.driveError")}</p> : found.driveFiles.length === 0 ? <p className="text-ink-secondary">{t("missingDoc.noneFound")}</p> : null}
            <div className="max-h-48 overflow-y-auto">
              {found.driveFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 border-b border-mist/60 py-1">
                  <span className="[overflow-wrap:anywhere]">{f.folder ? `${f.folder} / ` : ""}{f.name}</span>
                  <button type="button" className={btn} disabled={busy} onClick={() => act({ action: "drive", fileId: f.id, name: f.name })}>{t("missingDoc.useFile")}</button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="mb-1 font-medium text-ink">{t("missingDoc.assign")}</h4>
            <select defaultValue={found.assignee ?? ""} onChange={(e) => act({ action: "assign", authorId: e.target.value || null })} className="rounded-lg border border-mist bg-paper-2 px-2 py-1">
              <option value="">{t("missingDoc.nobody")}</option>
              {found.authors.map((a) => <option key={a.id} value={a.id}>{a.canonicalName}</option>)}
            </select>
          </section>
        </div>
      )}
    </div>
  );
}
