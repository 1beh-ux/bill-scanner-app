"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import MailInboxList from "@/components/mail/MailInboxList";
import MailDetailPanel from "@/components/mail/MailDetailPanel";
import BulkStatusModal from "@/components/mail/BulkStatusModal";
import MailActionLogModal from "@/components/mail/MailActionLogModal";
import type { DocumentType, MailMessage, Participant } from "@/components/mail/types";

const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function MailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const searchParams = useSearchParams();
  const mailConnect = searchParams.get("mailConnect");

  const [eventName, setEventName] = useState("");
  const [senderConfigured, setSenderConfigured] = useState<boolean | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(25);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setEventName(data.name);
          setSenderConfigured(Boolean(data.senderEmail));
        }
      });
    fetch(`/api/events/${eventId}/list-items?kind=document&all=false`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocumentTypes);
    fetch(`/api/events/${eventId}/mail/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setParticipants);
  }, [eventId]);

  function getSortedMessages(list: MailMessage[] = messages): MailMessage[] {
    const arr = [...list];
    arr.sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return sort === "oldest" ? da - db : db - da;
    });
    return arr;
  }

  function getNextMessageId(currentId: string): string | null {
    const sorted = getSortedMessages();
    const idx = sorted.findIndex((m) => m.messageId === currentId);
    if (idx < 0) return sorted[0]?.messageId ?? null;
    return sorted[idx + 1]?.messageId ?? sorted[idx - 1]?.messageId ?? null;
  }

  async function loadMessages() {
    setLoading(true);
    setInboxError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/mail/messages?count=${count}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInboxError(body.error === "sender_not_configured" ? t("mailInbox.senderNotConfigured") : t("mailInbox.loadFailed"));
        setLoading(false);
        return;
      }
      const data: MailMessage[] = await res.json();
      setMessages(data);
      if (data.length > 0 && !selectedMessageId) {
        setSelectedMessageId(getSortedMessages(data)[0].messageId);
      }
    } catch {
      setInboxError(t("mailInbox.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  function removeMessageAndAdvance(messageId: string) {
    const next = getNextMessageId(messageId);
    setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
    setSelectedMessageId(next !== messageId ? next : null);
  }

  function toggleSelectedId(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function selectAll() {
    const next: Record<string, boolean> = {};
    for (const m of messages) next[m.messageId] = true;
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds({});
  }

  async function runBulk(kind: "move" | "delete") {
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/mail/messages/bulk-${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: ids }),
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => !ids.includes(m.messageId)));
        if (selectedMessageId && ids.includes(selectedMessageId)) setSelectedMessageId(null);
        clearSelection();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedMessage = messages.find((m) => m.messageId === selectedMessageId) ?? null;

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <a href={`/events/${eventId}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.eventSetup")}
      </a>

      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-ink">
          {eventName} — {t("mailPage.title")}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setBulkModalOpen(true)} className={btnSecondary}>
            {t("mailPage.bulkStatusButton")}
          </button>
          <button onClick={() => setLogsModalOpen(true)} className={btnSecondary}>
            {t("mailPage.logsButton")}
          </button>
        </div>
      </div>

      {mailConnect === "connected" && (
        <p className="mb-3 text-[13px] text-green-600">{t("mailPage.mailboxConnectedBanner")}</p>
      )}
      {mailConnect === "error" && <p className="mb-3 text-[13px] text-red-600">{t("mailPage.mailboxConnectErrorBanner")}</p>}

      {senderConfigured === false && (
        <p className="mb-4 text-[13px] text-amber-600">
          {t("mailPage.senderNotConfiguredBanner")}{" "}
          <a href={`/events/${eventId}?tab=mail`} className="underline">
            {t("mailPage.senderNotConfiguredLink")}
          </a>
        </p>
      )}

      {inboxError && <p className="mb-3 text-[13px] text-red-600">{inboxError}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-mist bg-paper p-3 md:h-[75vh]">
          <MailInboxList
            messages={getSortedMessages()}
            loading={loading}
            count={count}
            onCountChange={setCount}
            onLoad={loadMessages}
            sort={sort}
            onSortChange={setSort}
            selectedMessageId={selectedMessageId}
            onSelectMessage={setSelectedMessageId}
            selectMode={selectMode}
            onToggleSelectMode={() => {
              setSelectMode((v) => !v);
              clearSelection();
            }}
            selectedIds={selectedIds}
            onToggleSelectedId={toggleSelectedId}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkMove={() => runBulk("move")}
            onBulkDelete={() => runBulk("delete")}
            bulkBusy={bulkBusy}
          />
        </div>

        <div className="rounded-lg border border-mist bg-paper p-4 md:h-[75vh] md:overflow-hidden">
          {selectedMessage ? (
            <MailDetailPanel
              eventId={eventId}
              message={selectedMessage}
              documentTypes={documentTypes}
              participants={participants}
              onExecuted={removeMessageAndAdvance}
              onDeleted={removeMessageAndAdvance}
            />
          ) : (
            <p className="text-[13px] text-ink-secondary">{t("mailDetail.emptyHint")}</p>
          )}
        </div>
      </div>

      {bulkModalOpen && (
        <BulkStatusModal eventId={eventId} eventName={eventName} onClose={() => setBulkModalOpen(false)} />
      )}
      {logsModalOpen && <MailActionLogModal eventId={eventId} onClose={() => setLogsModalOpen(false)} />}
    </div>
  );
}
