"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import AttachmentPreviewModal from "./AttachmentPreviewModal";
import { documentDisplayName, type DocumentType, type MailAttachment, type MailMessage, type Participant } from "./types";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const selectClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnDanger = "rounded-lg bg-red-600 px-3 py-2 text-[13px] text-white hover:bg-red-700 disabled:opacity-50";

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("cs-CZ");
  } catch {
    return iso;
  }
}

function normalize(s: string): string {
  return (s || "").toLowerCase();
}

// Port of the old app's detectChildFromEmail: longest participant-name
// substring match against subject+body wins.
function detectParticipant(message: MailMessage, participants: Participant[]): string | null {
  const text = normalize(`${message.subject} ${message.bodySnippet}`);
  let best: Participant | null = null;
  for (const p of participants) {
    const name = normalize(p.name);
    if (name && text.includes(name)) {
      if (!best || name.length > normalize(best.name).length) best = p;
    }
  }
  return best?.id ?? null;
}

// Port of renderAttachments' filename-keyword guess: split each document
// type's filenameSuffix on _/- and match any keyword against the filename.
function guessDocTypeId(filename: string, documentTypes: DocumentType[]): string | null {
  const n = normalize(filename);
  for (const docType of documentTypes) {
    const suffix = docType.data?.filenameSuffix;
    if (!suffix) continue;
    const keywords = suffix.toLowerCase().split(/[_-]/).filter(Boolean);
    if (keywords.some((k) => n.includes(k))) return docType.id;
  }
  return null;
}

type Actions = { saveAttachments: boolean; sendReply: boolean; moveEmail: boolean; updateStatus: boolean };

export default function MailDetailPanel({
  eventId,
  message,
  documentTypes,
  participants,
  onExecuted,
  onDeleted,
}: {
  eventId: string;
  message: MailMessage;
  documentTypes: DocumentType[];
  participants: Participant[];
  onExecuted: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
}) {
  const { t } = useTranslations();

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [autoDetected, setAutoDetected] = useState(false);
  const [note, setNote] = useState("");
  const [attachmentDocType, setAttachmentDocType] = useState<Record<string, string>>({});
  const [attachmentParticipant, setAttachmentParticipant] = useState<Record<string, string>>({});
  const [flagOnlyIds, setFlagOnlyIds] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [replyHint, setReplyHint] = useState("");
  const [actions, setActions] = useState<Actions>({
    saveAttachments: true,
    sendReply: true,
    moveEmail: true,
    updateStatus: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MailAttachment | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attachableDocTypes = useMemo(() => documentTypes.filter((d) => d.data?.filenameSuffix), [documentTypes]);

  const filteredParticipants = useMemo(() => {
    const q = normalize(participantSearch);
    return q ? participants.filter((p) => normalize(p.name).includes(q)) : participants;
  }, [participants, participantSearch]);

  // Reset all per-message working state whenever a different email is selected.
  useEffect(() => {
    const detected = detectParticipant(message, participants);
    setParticipantId(detected);
    setAutoDetected(Boolean(detected));
    setParticipantSearch("");
    setNote("");
    setFlagOnlyIds(new Set());
    setReplyText("");
    setReplyHint("");
    setError(null);
    setActions({ saveAttachments: true, sendReply: true, moveEmail: true, updateStatus: true });

    const nextDocType: Record<string, string> = {};
    const nextParticipant: Record<string, string> = {};
    for (const att of message.attachments) {
      const guess = guessDocTypeId(att.filename, documentTypes);
      if (guess) nextDocType[att.attachmentId] = guess;
      nextParticipant[att.attachmentId] = detected ?? "";
    }
    setAttachmentDocType(nextDocType);
    setAttachmentParticipant(nextParticipant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.messageId]);

  // Live-regenerating reply draft -- rebuilt whenever the participant,
  // attachment mapping/overrides, flag-only selections, or note change.
  useEffect(() => {
    if (!participantId) {
      setReplyHint(t("mailDetail.selectParticipantHint"));
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setReplyHint(t("mailDetail.generatingDraft"));

    debounceRef.current = setTimeout(async () => {
      const attachmentActions = message.attachments
        .map((att) => ({
          attachmentId: att.attachmentId,
          eventListItemId: attachmentDocType[att.attachmentId] || null,
          participantId: attachmentParticipant[att.attachmentId] || participantId,
        }))
        .filter((a) => a.eventListItemId);

      try {
        const res = await fetch(`/api/events/${eventId}/mail/messages/${message.messageId}/reply-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            note,
            attachmentActions,
            flagOnlyEventListItemIds: Array.from(flagOnlyIds),
          }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setReplyText(data.replyText || "");
        setReplyHint(t("mailDetail.draftUpdated"));
      } catch {
        setReplyHint(t("mailDetail.draftGenerationFailed"));
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, note, attachmentDocType, attachmentParticipant, flagOnlyIds]);

  async function handleExecute() {
    setError(null);
    if ((actions.saveAttachments || actions.updateStatus || actions.sendReply) && !participantId) {
      setError(t("mailDetail.selectParticipantHint"));
      return;
    }
    if (actions.sendReply && !replyText.trim()) {
      setError(t("mailDetail.replyTextRequired"));
      return;
    }

    setSaving(true);
    const attachmentActions = message.attachments.map((att) => ({
      attachmentId: att.attachmentId,
      filename: att.filename,
      mimeType: att.mimeType,
      eventListItemId: attachmentDocType[att.attachmentId] || null,
      participantId: attachmentParticipant[att.attachmentId] || participantId,
    }));

    try {
      const res = await fetch(`/api/events/${eventId}/mail/messages/${message.messageId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
          subject: message.subject,
          replyText,
          attachmentActions,
          flagOnlyEventListItemIds: Array.from(flagOnlyIds),
          actions,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t("mailDetail.executeFailed"));
        setSaving(false);
        return;
      }
      onExecuted(message.messageId);
    } catch {
      setError(t("mailDetail.executeFailed"));
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("mailDetail.confirmDelete"))) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/mail/messages/${message.messageId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: message.subject }),
      });
      if (!res.ok) {
        setError(t("mailDetail.deleteFailed"));
        setDeleting(false);
        return;
      }
      onDeleted(message.messageId);
    } catch {
      setError(t("mailDetail.deleteFailed"));
      setDeleting(false);
    }
  }

  function toggleFlagOnly(id: string, checked: boolean) {
    setFlagOnlyIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      <div className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <span className="text-ink-secondary">{t("mailDetail.fromLabel")}</span>
        <span className="text-ink">{message.from}</span>
        <span className="text-ink-secondary">{t("mailDetail.subjectLabel")}</span>
        <span className="text-ink">{message.subject}</span>
        <span className="text-ink-secondary">{t("mailDetail.dateLabel")}</span>
        <span className="text-ink">{fmtDate(message.date)}</span>
      </div>

      <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.bodyExcerptLabel")}</p>
      <pre className="mb-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-mist bg-paper-2 p-2 text-[12px] text-ink">
        {message.bodySnippet}
      </pre>

      <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.participantLabel")}</p>
      <div className="mb-1 flex gap-2">
        <input
          type="text"
          placeholder={t("mailDetail.participantSearchPlaceholder")}
          value={participantSearch}
          onChange={(e) => setParticipantSearch(e.target.value)}
          className={inputClass}
        />
        <select
          value={participantId ?? ""}
          onChange={(e) => {
            setParticipantId(e.target.value || null);
            setAutoDetected(false);
          }}
          className={selectClass}
        >
          <option value="">{t("mailDetail.participantNotFound")}</option>
          {filteredParticipants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-4 text-[12px] text-ink-secondary">
        {participantId
          ? autoDetected
            ? t("mailDetail.autoDetectedHint")
            : t("mailDetail.manuallySelectedHint")
          : t("mailDetail.notDetectedHint")}
      </p>

      <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.attachmentsLabel")}</p>
      {message.attachments.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-secondary">{t("mailDetail.noAttachments")}</p>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          {message.attachments.map((att) => (
            <div key={att.attachmentId} className="rounded-lg border border-mist bg-paper-2 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[13px] text-ink">{att.filename}</span>
                <button onClick={() => setPreviewAttachment(att)} className="shrink-0 text-[12px] text-ember hover:underline">
                  {t("mailDetail.previewButton")}
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={attachmentParticipant[att.attachmentId] ?? ""}
                  onChange={(e) =>
                    setAttachmentParticipant((prev) => ({ ...prev, [att.attachmentId]: e.target.value }))
                  }
                  className={selectClass}
                >
                  <option value="">{t("mailDetail.participantNotFound")}</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={attachmentDocType[att.attachmentId] ?? ""}
                  onChange={(e) => setAttachmentDocType((prev) => ({ ...prev, [att.attachmentId]: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">{t("mailDetail.ignoreOption")}</option>
                  {attachableDocTypes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {documentDisplayName(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.noteLabel")}</label>
      <input
        type="text"
        placeholder={t("mailDetail.notePlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={inputClass + " mb-4"}
      />

      <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.replyPreviewLabel")}</p>
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        rows={8}
        className={inputClass + " mb-1 font-mono text-[12px]"}
      />
      <p className="mb-4 text-[12px] text-ink-secondary">{replyHint}</p>

      <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("mailDetail.actionsLabel")}</p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={actions.saveAttachments}
            onChange={(e) => setActions((a) => ({ ...a, saveAttachments: e.target.checked }))}
          />
          {t("mailDetail.actionSaveAttachments")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={actions.sendReply}
            onChange={(e) => setActions((a) => ({ ...a, sendReply: e.target.checked }))}
          />
          {t("mailDetail.actionSendReply")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={actions.moveEmail}
            onChange={(e) => setActions((a) => ({ ...a, moveEmail: e.target.checked }))}
          />
          {t("mailDetail.actionMoveEmail")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={actions.updateStatus}
            onChange={(e) => setActions((a) => ({ ...a, updateStatus: e.target.checked }))}
          />
          {t("mailDetail.actionUpdateStatus")}
        </label>
      </div>

      {actions.updateStatus && (
        <div className="mb-4 rounded-lg border border-mist bg-paper-2 p-2">
          <p className="mb-1 text-[12px] text-ink-secondary">{t("mailDetail.flagOnlyHint")}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {documentTypes.map((d) => (
              <label key={d.id} className="flex items-center gap-1.5 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={flagOnlyIds.has(d.id)}
                  onChange={(e) => toggleFlagOnly(d.id, e.target.checked)}
                />
                {documentDisplayName(d)}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between gap-2">
        <button onClick={handleDelete} disabled={deleting} className={btnDanger}>
          {t("mailDetail.deleteButton")}
        </button>
        <button onClick={handleExecute} disabled={saving} className={btnPrimary}>
          {saving ? t("common.loading") : t("mailDetail.executeButton")}
        </button>
      </div>

      {previewAttachment && (
        <AttachmentPreviewModal
          eventId={eventId}
          messageId={message.messageId}
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
