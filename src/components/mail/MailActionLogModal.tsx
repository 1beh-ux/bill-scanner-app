"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type LogRow = {
  id: string;
  action: string;
  status: string;
  timestamp: string;
  userDisplayName: string;
  participantName: string | null;
  subject: string | null;
  details: string | null;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("cs-CZ");
  } catch {
    return iso;
  }
}

export default function MailActionLogModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { t } = useTranslations();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${eventId}/mail/action-log?limit=30`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-paper p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">{t("mailActionLogModal.title")}</h2>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-[14px] text-ink-secondary">{t("mailActionLogModal.empty")}</p>
          ) : (
            <ul className="list-none divide-y divide-mist p-0">
              {rows.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="text-[13px] font-medium text-ink">
                    {t(`mailActionLogModal.action.${r.action}`)} ·{" "}
                    <span className={r.status === "ok" || r.status === "sent" ? "text-green-600" : "text-red-600"}>
                      {r.status}
                    </span>
                  </p>
                  <p className="text-[12px] text-ink-secondary">
                    {fmtDate(r.timestamp)} · {r.userDisplayName}
                  </p>
                  {(r.participantName || r.subject) && (
                    <p className="text-[12px] text-ink-secondary">
                      {r.participantName} {r.subject ? `· ${r.subject}` : ""}
                    </p>
                  )}
                  {r.details && <p className="text-[12px] text-ink-secondary">{r.details}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
