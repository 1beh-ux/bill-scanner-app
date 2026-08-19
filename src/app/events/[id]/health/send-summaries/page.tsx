"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import ParentEmailLogTable, { type EmailLogRow } from "@/components/health/ParentEmailLogTable";
import TemplatePreviewModal from "@/components/health/TemplatePreviewModal";

type EventBasic = { id: string; name: string };
type Participant = {
  id: string;
  name: string;
  groupName: string | null;
  guardianEmails: string[];
  incidentCount: number;
  lastSent: { sentAt: string; status: "sent" | "failed" } | null;
};

type SendResult = {
  participantId: string;
  participantName: string;
  guardians: { guardianId: string; guardianEmail: string; status: "sent" | "failed"; errorMessage?: string }[];
};

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function SendSummariesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [tab, setTab] = useState<"send" | "log">("send");
  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [evRes, partRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/health/send-summaries`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    setLoading(false);
  }

  async function loadLogs() {
    const res = await fetch(`/api/events/${eventId}/health/emails`);
    if (res.ok) setLogs(await res.json());
  }

  useEffect(() => {
    load();
    loadLogs();
  }, [eventId]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === participants.length ? new Set() : new Set(participants.map((p) => p.id))));
  }

  async function handleSend() {
    if (!window.confirm(t("bulkSendSummaries.confirm", { count: String(selected.size) }))) return;
    setSending(true);
    setResults(null);
    const res = await fetch(`/api/events/${eventId}/health/send-summaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantIds: Array.from(selected) }),
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results);
      load();
      loadLogs();
    }
  }

  async function handleResend(log: EmailLogRow) {
    setResendingId(log.id);
    await fetch(`/api/participants/${log.participantId}/emails/${log.id}/resend`, { method: "POST" });
    setResendingId(null);
    loadLogs();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("bulkSendSummaries.title")}
      </h1>

      <div className="mb-4 flex gap-1 border-b border-mist">
        <button
          onClick={() => setTab("send")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "send" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("bulkSendSummaries.tabSend")}
        </button>
        <button
          onClick={() => setTab("log")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "log" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("sendLog.title")}
        </button>
      </div>

      {tab === "send" && (
        <>
          {participants.length === 0 ? (
            <p className="text-[14px] text-ink-secondary">{t("participantsPage.empty")}</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={selected.size === participants.length}
                    onChange={toggleSelectAll}
                  />
                  {t("bulkSendSummaries.selectAll")}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowTemplatePreview(true)}
                    className="text-[13px] text-ember hover:underline"
                  >
                    {t("bulkSendSummaries.previewTemplateButton")}
                  </button>
                  <button onClick={handleSend} disabled={sending || selected.size === 0} className={btnPrimary}>
                    {sending
                      ? t("common.loading")
                      : t("bulkSendSummaries.sendButton", { count: String(selected.size) })}
                  </button>
                </div>
              </div>

              <div className="mb-6 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
                      <th className="p-2 font-medium"></th>
                      <th className="p-2 font-medium">{t("bulkSendSummaries.colName")}</th>
                      <th className="p-2 font-medium">{t("bulkSendSummaries.colGuardians")}</th>
                      <th className="p-2 font-medium">{t("bulkSendSummaries.colIncidents")}</th>
                      <th className="p-2 font-medium">{t("bulkSendSummaries.colLastSent")}</th>
                      <th className="p-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => {
                      const r = results?.find((x) => x.participantId === p.id);
                      const sentCount = r?.guardians.filter((g) => g.status === "sent").length ?? 0;
                      const failedCount = r ? r.guardians.length - sentCount : 0;
                      return (
                        <tr key={p.id} className="border-b border-mist/60">
                          <td className="p-2">
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                          </td>
                          <td className="p-2 text-ink">
                            {p.name}
                            {p.groupName && <span className="text-ink-secondary"> · {p.groupName}</span>}
                          </td>
                          <td className="p-2 text-ink-secondary">
                            {p.guardianEmails.length > 0 ? (
                              p.guardianEmails.join(", ")
                            ) : (
                              <span className="text-amber-600">{t("bulkSendSummaries.noGuardians")}</span>
                            )}
                          </td>
                          <td className="p-2 text-ink-secondary">{p.incidentCount}</td>
                          <td className="p-2 text-ink-secondary">
                            {p.lastSent
                              ? `${new Date(p.lastSent.sentAt).toLocaleDateString("cs-CZ")} · ${
                                  p.lastSent.status === "sent" ? t("sendLog.statusSent") : t("sendLog.statusFailed")
                                }`
                              : "—"}
                          </td>
                          <td className="p-2 text-ink-secondary">
                            {r && t("bulkSendSummaries.resultInline", { sent: String(sentCount), failed: String(failedCount) })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "log" && (
        <ParentEmailLogTable logs={logs} showParticipant onResend={handleResend} resendingId={resendingId} />
      )}

      {showTemplatePreview && (
        <TemplatePreviewModal eventId={eventId} onClose={() => setShowTemplatePreview(false)} />
      )}
    </div>
  );
}
