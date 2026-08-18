"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import ParentEmailLogTable, { type EmailLogRow } from "@/components/health/ParentEmailLogTable";

type EventBasic = { id: string; name: string };
type Participant = { id: string; name: string; groupName: string | null };

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

  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [evRes, partRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/participants`),
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
    <div className="mx-auto max-w-3xl p-4 md:p-8">
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
                <button onClick={handleSend} disabled={sending || selected.size === 0} className={btnPrimary}>
                  {sending
                    ? t("common.loading")
                    : t("bulkSendSummaries.sendButton", { count: String(selected.size) })}
                </button>
              </div>

              <ul className="mb-6 list-none p-0">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 border-b border-mist/60 py-2">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    <span className="text-[14px] text-ink">{p.name}</span>
                    {p.groupName && <span className="text-[13px] text-ink-secondary">· {p.groupName}</span>}
                    {results && (
                      <span className="ml-auto text-[12px] text-ink-secondary">
                        {(() => {
                          const r = results.find((x) => x.participantId === p.id);
                          if (!r) return null;
                          const sent = r.guardians.filter((g) => g.status === "sent").length;
                          const failed = r.guardians.length - sent;
                          return t("bulkSendSummaries.resultInline", { sent: String(sent), failed: String(failed) });
                        })()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === "log" && (
        <ParentEmailLogTable logs={logs} showParticipant onResend={handleResend} resendingId={resendingId} />
      )}
    </div>
  );
}
