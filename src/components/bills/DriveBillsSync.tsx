"use client";

import { useTranslations } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { runDriveExport, type ExportSummary } from "@/lib/drive-export-client";
import { driveErrorText, type DriveErrorInfo } from "@/lib/drive-error-messages";

// Bill list: "Synchronizovat s Diskem" -- uploads approved bills not yet on Drive and rewrites the
// manifest sheet (POST /api/events/[id]/drive-export, same as Nastavení akce -> Připojení), plus
// a status line derived from the bills: how many approved ones are on Drive, the newest upload,
// what's still missing (approved, not uploaded) and what never goes there (not approved).
type T = (key: string, vars?: Record<string, string>) => string;
type Bill = { status: string; exportedAt: string | null };
type Summary = ExportSummary;

const btn = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-paper disabled:opacity-50";

export default function DriveBillsSync({ eventId, bills, exportFolderId, manifestId, lockedUntil, onSynced, t }: { eventId: string; bills: Bill[]; exportFolderId: string | null; manifestId: string | null; lockedUntil: string | null; onSynced: () => void; t: T }) {
  const [running, setRunning] = useState(false);
  // An export started elsewhere (another tab, or this page before a reload) still runs: the button
  // stays off and the page looks every few seconds until it's done (Event.driveExportLockedUntil).
  const [elsewhere, setElsewhere] = useState(() => !!lockedUntil && new Date(lockedUntil) > new Date());
  // Only admins can connect Drive (audit 2026-11-05): others are told whom to ask.
  const { role } = useTranslations();
  useEffect(() => {
    if (!elsewhere) return;
    const timer = setInterval(async () => {
      const ev = await fetch(`/api/events/${eventId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (ev && !(ev.driveExportLockedUntil && new Date(ev.driveExportLockedUntil) > new Date())) {
        setElsewhere(false);
        onSynced();
      }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSynced is a new function every render
  }, [elsewhere, eventId]);
  const [error, setError] = useState<{ code: string; info: DriveErrorInfo } | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

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
    const out = await runDriveExport(eventId, recreateManifest, (done, remaining) => setProgress(t("billDriveSync.progress", { done: String(done), remaining: String(remaining) })));
    setRunning(false);
    setProgress(null);
    if (!out.ok && out.data.error === "export_running") return setElsewhere(true);
    if (!out.ok) return setError({ code: out.data.error ?? "drive_unknown", info: out.data });
    setResult(out.data);
    onSynced();
  }

  if (!exportFolderId) {
    return (
      <p className="mb-4 text-[13px] text-ink-secondary">
        {t("billDriveSync.noFolder")}{" "}
        {role === "admin" ? (<a href={`/events/${eventId}?tab=pripojeni`} className="text-ember hover:underline">{t("billDriveSync.setFolder")}</a>) : t("billDriveSync.askAdmin")}
      </p>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-1 rounded-lg border border-mist bg-paper-2 p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => sync()} disabled={running || elsewhere || approved.length === 0} className={btn}>
          {running ? progress ?? t("billDriveSync.running") : elsewhere ? t("billDriveSync.runningElsewhere") : t("billDriveSync.button")}
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
