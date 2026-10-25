"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";

// Seznam účastníků -> Google Sheet in the export folder (next to the bills manifest); on Účastníci and Dokumenty.
export default function DriveExportButton({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ warn: boolean; text: string; href?: string } | null>(null);

  async function run() {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/events/${eventId}/participants/drive-export`, { method: "POST" }).catch(() => null);
    const r = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) setNotice({ warn: false, text: t("participantsPage.driveExportDone", { count: String(r.count) }), href: r.url });
    else setNotice({ warn: true, text: r?.error === "no_export_folder" ? t("participantsPage.driveExportNoFolder") : driveErrorText(t, r?.error ?? "unexpected", r ?? {}) });
  }

  return (
    <>
      <button onClick={run} disabled={busy} title={t("participantsPage.driveExportHint")} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50">
        {busy ? t("participantsPage.driveExporting") : t("participantsPage.driveExport")}
      </button>
      {notice && (
        <span role="status" className={"basis-full rounded-lg border px-3 py-2 text-[13px] " + (notice.warn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-pine/40 bg-pine/10 text-pine")}>
          {notice.text}
          {notice.href && (
            <>
              {" "}
              <a href={notice.href} target="_blank" rel="noreferrer" className="underline">
                {t("participantsPage.driveExportOpen")}
              </a>
            </>
          )}{" "}
          <button onClick={() => setNotice(null)} className="ml-2 hover:underline">
            {t("common.close")}
          </button>
        </span>
      )}
    </>
  );
}
