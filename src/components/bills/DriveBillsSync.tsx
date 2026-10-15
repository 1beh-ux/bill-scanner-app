"use client";

import { useState } from "react";
import { driveErrorText, type DriveErrorInfo } from "@/lib/drive-error-messages";

// Bill list: "Synchronizovat s Diskem" -- uploads approved bills not yet on Drive and rewrites the
// manifest sheet (POST /api/events/[id]/drive-export, same as Nastavení akce -> Připojení), plus
// a status line derived from the bills: how many approved ones are on Drive, the newest upload,
// what's still missing (approved, not uploaded) and what never goes there (not approved).
type T = (key: string, vars?: Record<string, string>) => string;
type Bill = { status: string; exportedAt: string | null };
type Summary = { totalApproved: number; newlyExported: number; alreadyExported: number; exportFailures: { filename: string; error: string }[]; manifestSpreadsheetId: string };

const btn = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-paper disabled:opacity-50";

export default function DriveBillsSync({ eventId, bills, exportFolderId, manifestId, onSynced, t }: { eventId: string; bills: Bill[]; exportFolderId: string | null; manifestId: string | null; onSynced: () => void; t: T }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ code: string; info: DriveErrorInfo } | null>(null);
  const [result, setResult] = useState<Summary | null>(null);

  const approved = bills.filter((b) => b.status === "approved");
  const onDrive = approved.filter((b) => b.exportedAt).length;
  const missing = approved.length - onDrive;
  const notApproved = bills.length - approved.length;
  const last = bills.reduce<string | null>((max, b) => (b.exportedAt && (!max || b.exportedAt > max) ? b.exportedAt : max), null);
  const sheet = result?.manifestSpreadsheetId ?? manifestId;

  async function sync(recreateManifest = false) {
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/events/${eventId}/drive-export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recreateManifest }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setRunning(false);
    if (!res?.ok) return setError({ code: data?.error ?? "drive_unknown", info: data ?? {} });
    setResult(data);
    onSynced();
  }

  if (!exportFolderId) {
    return (
      <p className="mb-4 text-[13px] text-ink-secondary">
        {t("billDriveSync.noFolder")}{" "}
        <a href={`/events/${eventId}?tab=pripojeni`} className="text-ember hover:underline">{t("billDriveSync.setFolder")}</a>
      </p>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-1 rounded-lg border border-mist bg-paper-2 p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => sync()} disabled={running || approved.length === 0} className={btn}>
          {running ? t("billDriveSync.running") : t("billDriveSync.button")}
        </button>
        <span className="text-ink">{t("billDriveSync.status", { onDrive: String(onDrive), approved: String(approved.length) })}</span>
        {last && <span className="text-ink-secondary">{t("billDriveSync.last", { when: new Date(last).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" }) })}</span>}
        {missing > 0 && <span className="text-amber-700">{t("billDriveSync.missing", { count: String(missing) })}</span>}
        {notApproved > 0 && <span className="text-ink-secondary">{t("billDriveSync.notApproved", { count: String(notApproved) })}</span>}
        {sheet && (
          <a href={`https://docs.google.com/spreadsheets/d/${sheet}/edit`} target="_blank" rel="noopener noreferrer" className="text-ember hover:underline">
            {t("driveSettings.exportOpenManifest")}
          </a>
        )}
        <a href={`https://drive.google.com/drive/folders/${exportFolderId}`} target="_blank" rel="noopener noreferrer" className="text-ember hover:underline">
          {t("billDriveSync.openFolder")}
        </a>
      </div>
      {result && (
        <p className="text-pine">
          {t("driveSettings.exportResultSummary", { total: String(result.totalApproved), new: String(result.newlyExported), already: String(result.alreadyExported) })}
        </p>
      )}
      {result?.exportFailures.length ? (
        <ul className="list-disc pl-5 text-red-600">
          {result.exportFailures.map((f) => (
            <li key={f.filename}>{f.filename}: {driveErrorText(t, f.error, { folderLabel: "export" })}</li>
          ))}
        </ul>
      ) : null}
      {error && (
        <div className="text-red-600">
          {driveErrorText(t, error.code, error.info)}
          {error.code === "manifest_missing" && (
            <button type="button" onClick={() => sync(true)} className="ml-2 text-ember hover:underline">{t("driveSettings.recreateManifest")}</button>
          )}
        </div>
      )}
    </div>
  );
}
