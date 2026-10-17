"use client";

import { useState } from "react";

// Pošta: "Synchronizovat s Diskem" -- documents per child and the participant status sheet into the
// event's participants folder (Nastavení akce -> Připojení na Google), plus the sheet connections.
// Same run as Účastníci -> Dokumenty, with ?all=1 (also what isn't switched on for the automatic runs).
type T = (key: string, vars?: Record<string, string>) => string;
type Result = { what: string; ok: boolean; detail?: string };

export default function MailDriveSync({ eventId, className, t }: { eventId: string; className: string; t: T }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [folder, setFolder] = useState<boolean | null>(null);

  async function run() {
    setBusy(true);
    setResults(null);
    const r = await fetch(`/api/events/${eventId}/documents/sync?all=1`, { method: "POST" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setBusy(false);
    setFolder(r ? !!r.drive?.configured : null);
    setResults(r ? r.results : [{ what: "all", ok: false, detail: "failed" }]);
  }

  const label = (what: string) => (what.startsWith("sheet:") ? t("documentSync.sheet", { name: what.slice(6) }) : what === "drive" ? t("documentSync.drive") : what === "statusSheet" ? t("documentSync.statusSheet") : t("documentSync.all"));
  return (
    <span className="relative">
      <button type="button" onClick={run} disabled={busy} className={className} title={t("mailDriveSync.hint")}>
        {busy ? t("documentSync.running") : t("mailDriveSync.button")}
      </button>
      {results && (
        <span className="absolute right-0 top-full z-20 mt-1 block w-72 rounded-lg border border-mist bg-paper-2 p-2 text-[12.5px] shadow-lg" onClick={() => setResults(null)}>
          {folder === false && (
            <span className="block text-amber-700">
              {t("mailDriveSync.noFolder")} <a href={`/events/${eventId}?tab=pripojeni`} className="text-ember hover:underline">{t("billDriveSync.setFolder")}</a>
            </span>
          )}
          {results.length === 0 && folder !== false && <span className="block text-ink-secondary">{t("documentSync.nothingConnected")}</span>}
          {results.map((r) => (
            <span key={r.what} className={"block " + (r.ok ? "text-pine" : "text-red-600")}>
              {label(r.what)}: {r.ok ? t("documentSync.ok") : t("documentSync.failed", { code: r.detail ?? "" })}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
