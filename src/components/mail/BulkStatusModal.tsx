"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type DocTypeCol = { id: string; name: string };
type BulkRow = {
  participantId: string;
  participantName: string;
  allComplete: boolean;
  defaultSend: boolean;
  documents: { eventListItemId: string; received: boolean }[];
};

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function BulkStatusModal({
  eventId,
  eventName,
  onClose,
}: {
  eventId: string;
  eventName: string;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocTypeCol[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/mail/bulk-status-preview`);
    if (res.ok) {
      const data = await res.json();
      setDocumentTypes(data.documentTypes);
      setRows(data.rows);
      setPreview(data.templatePreview);
      const initial: Record<string, boolean> = {};
      for (const r of data.rows as BulkRow[]) initial[r.participantId] = r.defaultSend;
      setSelected(initial);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  function setAll(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.participantId] = value;
    setSelected(next);
  }

  async function handleSend() {
    const participantIds = Object.keys(selected).filter((id) => selected[id]);
    if (participantIds.length === 0) return;
    if (!window.confirm(t("bulkStatusModal.confirmSend", { count: String(participantIds.length) }))) return;

    setSending(true);
    setStatus(t("bulkStatusModal.sending"));
    try {
      const res = await fetch(`/api/events/${eventId}/mail/bulk-status-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds }),
      });
      if (!res.ok) {
        setStatus(t("bulkStatusModal.sendFailed"));
        return;
      }
      const data = await res.json();
      setStatus(t("bulkStatusModal.sendDone", { sent: String(data.sentCount), failed: String(data.failedCount) }));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-paper p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">{t("bulkStatusModal.title")}</h2>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>
        <p className="mb-4 text-[13px] text-ink-secondary">{eventName}</p>

        {loading ? (
          <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {preview && (
              <div className="mb-4 rounded-lg border border-mist bg-paper-2 p-3">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">
                  {t("bulkStatusModal.previewTitle")}
                </p>
                <p className="mb-2 text-[14px] font-medium text-ink">{preview.subject}</p>
                <p className="whitespace-pre-wrap text-[13px] text-ink-secondary">{preview.body}</p>
              </div>
            )}

            <div className="mb-2 flex gap-2">
              <button onClick={() => setAll(true)} className={btnSecondary}>
                {t("bulkStatusModal.checkAllButton")}
              </button>
              <button onClick={() => setAll(false)} className={btnSecondary}>
                {t("bulkStatusModal.uncheckAllButton")}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-mist text-left">
                    <th className="p-2 font-medium text-ink-secondary">{t("bulkStatusModal.colSend")}</th>
                    <th className="p-2 font-medium text-ink-secondary">{t("bulkStatusModal.colParticipant")}</th>
                    {documentTypes.map((d) => (
                      <th key={d.id} className="p-2 font-medium text-ink-secondary">
                        {d.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.participantId} className={"border-b border-mist/60 " + (r.allComplete ? "opacity-60" : "")}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[r.participantId])}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [r.participantId]: e.target.checked }))}
                        />
                      </td>
                      <td className="p-2 text-ink">{r.participantName}</td>
                      {documentTypes.map((d) => {
                        const doc = r.documents.find((x) => x.eventListItemId === d.id);
                        return (
                          <td key={d.id} className="p-2">
                            {doc?.received ? "✅" : "❌"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {status && <span className="text-[13px] text-ink-secondary">{status}</span>}
          <button onClick={handleSend} disabled={sending || selectedCount === 0} className={btnPrimary}>
            {t("bulkStatusModal.sendButton", { count: String(selectedCount) })}
          </button>
        </div>
      </div>
    </div>
  );
}
