"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import {
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type Mode = "acceptance" | "freeform";

type AutoAttachDocType = { id: string; name: string };

export default function ComposeEmailModal({
  eventId,
  participantIds,
  mode,
  onClose,
  onSent,
}: {
  eventId: string;
  participantIds: string[];
  mode: Mode;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslations();
  const purposeKey = mode === "acceptance" ? REGISTRATION_ACCEPTANCE_PURPOSE_KEY : PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(mode === "acceptance");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(null);
  const [autoAttachDocTypes, setAutoAttachDocTypes] = useState<AutoAttachDocType[]>([]);
  const [selectedDocTypeIds, setSelectedDocTypeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (mode !== "acceptance") return;
    fetch(`/api/events/${eventId}/email-template?purposeKey=${encodeURIComponent(purposeKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSubject(data.subject);
          setBody(data.body);
        }
      })
      .finally(() => setLoading(false));
    fetch(`/api/events/${eventId}/list-items?kind=document&all=false`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: { id: string; name: string; data?: { templateGoogleDocId?: string; autoAttachOnAccept?: boolean } | null }[]) => {
        const eligible = items.filter((i) => i.data?.templateGoogleDocId);
        setAutoAttachDocTypes(eligible.map((i) => ({ id: i.id, name: i.name })));
        setSelectedDocTypeIds(new Set(eligible.filter((i) => i.data?.autoAttachOnAccept).map((i) => i.id)));
      })
      .catch(() => {});
  }, [eventId, mode, purposeKey]);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    const form = new FormData();
    form.set("participantIds", JSON.stringify(participantIds));
    form.set("subject", subject);
    form.set("body", body);
    form.set("purposeKey", purposeKey);
    form.set("markAccepted", String(mode === "acceptance"));
    if (mode === "acceptance") {
      form.set("autoAttachDocumentTypeIds", JSON.stringify(Array.from(selectedDocTypeIds)));
    }
    if (attachment) form.set("attachment", attachment);

    try {
      const res = await fetch(`/api/events/${eventId}/participants/bulk-email`, { method: "POST", body: form });
      if (!res.ok) return;
      const data = await res.json();
      setResult({ sentCount: data.sentCount, failedCount: data.failedCount });
      onSent();
    } finally {
      setSending(false);
    }
  }

  function toggleDocType(id: string) {
    setSelectedDocTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg bg-paper p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">
            {mode === "acceptance" ? t("composeEmailModal.titleAcceptance") : t("composeEmailModal.titleFreeform")}
          </h2>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>
        <p className="mb-4 text-[13px] text-ink-secondary">
          {t("composeEmailModal.recipientCount", { count: String(participantIds.length) })}
        </p>

        {loading ? (
          <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
        ) : result ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-ink">
              {t("composeEmailModal.sendDone", { sent: String(result.sentCount), failed: String(result.failedCount) })}
            </p>
            <button onClick={onClose} className={btnPrimary + " self-start"}>
              {t("common.close")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("composeEmailModal.subjectPlaceholder")}
              className={inputClass}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("composeEmailModal.bodyPlaceholder")}
              className={inputClass}
              rows={8}
            />
            {mode === "acceptance" && autoAttachDocTypes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[13px] text-ink-secondary">{t("composeEmailModal.autoAttachDocumentsLabel")}</p>
                {autoAttachDocTypes.map((docType) => (
                  <label key={docType.id} className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={selectedDocTypeIds.has(docType.id)}
                      onChange={() => toggleDocType(docType.id)}
                    />
                    {docType.name}
                  </label>
                ))}
              </div>
            )}
            <label className="text-[13px] text-ink-secondary">
              {t("composeEmailModal.attachmentLabel")}
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-[13px]"
              />
            </label>
            <p className="text-[12px] text-ink-secondary">{t("composeEmailModal.variablesHint")}</p>

            <div className="mt-2 flex justify-end">
              <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className={btnPrimary}>
                {sending
                  ? t("common.loading")
                  : t("composeEmailModal.sendButton", { count: String(participantIds.length) })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
