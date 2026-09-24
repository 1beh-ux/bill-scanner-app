"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";

// "Save to Google Sheet" for the whole event schedule (POST .../planning/drive-sheet).
export default function DriveSheetExport({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [state, setState] = useState<{ url: string | null; syncedAt: string | null }>({ url: null, syncedAt: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/planning/drive-sheet`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d));
  }, [eventId]);

  async function exportNow() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/planning/drive-sheet`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return setState(body);
    setError(
      body.error === "no_export_folder" ? (
        <>
          {t("planBoard.errorNoExportFolder")}{" "}
          <a href={`/events/${eventId}?tab=pripojeni`} className="underline">
            {t("planBoard.openSettings")}
          </a>
        </>
      ) : (
        driveErrorText(t, body.error ?? "drive_unknown", body)
      )
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <button
        onClick={exportNow}
        disabled={busy}
        className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-ink hover:bg-mist disabled:opacity-50"
      >
        {busy ? t("common.loading") : state.url ? t("planBoard.driveUpdate") : t("planBoard.driveCreate")}
      </button>
      {state.url && (
        <a href={state.url} target="_blank" rel="noreferrer" className="text-ember hover:underline">
          {t("planBoard.driveOpen")}
        </a>
      )}
      {state.syncedAt && (
        <span className="text-[12px] text-ink-secondary">
          {t("planBoard.driveSyncedAt", { time: new Date(state.syncedAt).toLocaleString("cs-CZ") })}
        </span>
      )}
      {error && <span className="basis-full text-[12.5px] text-red-600">{error}</span>}
    </div>
  );
}
