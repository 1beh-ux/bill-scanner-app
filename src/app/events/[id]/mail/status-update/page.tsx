"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";

type DocTypeCol = { id: string; name: string };
type Row = {
  participantId: string;
  participantName: string;
  allComplete: boolean;
  recipientEmails: string[];
  defaultSend: boolean;
  documents: { eventListItemId: string; received: boolean }[];
};

const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

// Update stavu dokumentů: who gets the "what we have / what's missing" e-mail
// (left) and the e-mail itself (right) -- as the template, or filled in for a
// chosen participant by the send's own code.
export default function StatusUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [documentTypes, setDocumentTypes] = useState<DocTypeCol[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [template, setTemplate] = useState<{ subject: string; body: string } | null>(null);
  const [view, setView] = useState<"filled" | "template">("filled");
  const [previewFor, setPreviewFor] = useState("");
  const [filled, setFilled] = useState<{ subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; warn: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/mail/bulk-status-preview`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setDocumentTypes(data.documentTypes);
        setRows(data.rows);
        setTemplate(data.template);
        const only = new URLSearchParams(window.location.search).get("only");
        setSelected(Object.fromEntries((data.rows as Row[]).map((r) => [r.participantId, only ? r.participantId === only : r.defaultSend])));
        const first = (data.rows as Row[]).find((r) => (only ? r.participantId === only : r.defaultSend)) ?? data.rows[0];
        setPreviewFor(first?.participantId ?? "");
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    if (!template || !previewFor) return;
    fetch(`/api/events/${eventId}/email-template/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, participantId: previewFor, ...template }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setFilled)
      .catch(() => setFilled(null));
  }, [eventId, template, previewFor]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const setAll = (value: boolean) => setSelected(Object.fromEntries(rows.map((r) => [r.participantId, value])));

  async function handleSend() {
    if (selectedIds.length === 0) return;
    if (!(await confirm({ message: t("bulkStatusModal.confirmSend", { count: String(selectedIds.length) }) }))) return;
    setSending(true);
    setStatus({ text: t("bulkStatusModal.sending"), warn: false });
    try {
      const res = await fetch(`/api/events/${eventId}/mail/bulk-status-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: selectedIds }),
      });
      if (!res.ok) return setStatus({ text: t("bulkStatusModal.sendFailed"), warn: true });
      const d = await res.json();
      setStatus({ text: t("bulkStatusModal.sendDone", { sent: String(d.sentCount), failed: String(d.failedCount) }), warn: d.failedCount > 0 });
    } finally {
      setSending(false);
    }
  }

  const shown = view === "template" || !filled ? template : filled;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <button onClick={() => router.back()} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("common.back")}
      </button>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("statusUpdate.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">
        {t("statusUpdate.intro")}{" "}
        <Link href={`/events/${eventId}?tab=posta`} className="text-ember hover:underline">
          {t("compose.editTemplate")}
        </Link>
      </p>

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : (
        // Documents first: the table gets the room it needs and the preview a third;
        // with many tracked documents the preview goes below the table instead.
        <div className={"grid gap-6 " + (documentTypes.length > 4 ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]")}>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setAll(true)} className={btnSecondary}>
                {t("bulkStatusModal.checkAllButton")}
              </button>
              <button onClick={() => setAll(false)} className={btnSecondary}>
                {t("bulkStatusModal.uncheckAllButton")}
              </button>
            </div>
            <div className="scrollbar-app overflow-x-auto rounded-lg border border-mist">
              <table className="w-full min-w-[500px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-mist text-left">
                    <th className="p-2 font-medium text-ink-secondary">{t("bulkStatusModal.colSend")}</th>
                    <th className="p-2 font-medium text-ink-secondary">{t("bulkStatusModal.colParticipant")}</th>
                    <th className="p-2 font-medium text-ink-secondary">{t("bulkStatusModal.colRecipients")}</th>
                    {documentTypes.map((d) => (
                      <th key={d.id} className="p-2 font-medium text-ink-secondary">
                        {d.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.participantId}
                      onClick={() => setPreviewFor(r.participantId)}
                      className={
                        "cursor-pointer border-b border-mist/60 " +
                        (r.participantId === previewFor ? "bg-ember/10 " : "hover:bg-paper-2 ") +
                        (r.allComplete ? "opacity-60" : "")
                      }
                    >
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[r.participantId])}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [r.participantId]: e.target.checked }))}
                        />
                      </td>
                      <td className="p-2 text-ink">{r.participantName}</td>
                      <td className="p-2">
                        {r.recipientEmails.length > 0 ? (
                          <span className="text-ink-secondary">{r.recipientEmails.join(", ")}</span>
                        ) : (
                          <span className="text-amber-700" title={t("bulkStatusModal.noRecipientHint")}>
                            ⚠ {t("bulkStatusModal.noRecipient")}
                          </span>
                        )}
                      </td>
                      {documentTypes.map((d) => (
                        <td key={d.id} className="p-2">
                          {r.documents.find((x) => x.eventListItemId === d.id)?.received ? "✅" : "❌"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleSend} disabled={sending || selectedIds.length === 0} className={btnPrimary}>
                {t("bulkStatusModal.sendButton", { count: String(selectedIds.length) })}
              </button>
              {status && <span className={"text-[13px] " + (status.warn ? "text-amber-700" : "text-ink-secondary")}>{status.text}</span>}
            </div>
          </div>

          <aside className={"flex min-w-0 flex-col gap-3 self-start rounded-lg border border-mist bg-paper p-4 " + (documentTypes.length > 4 ? "" : "lg:sticky lg:top-4")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-mist p-0.5 text-[13px]">
                {(["filled", "template"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={"rounded-md px-3 py-1 " + (view === v ? "bg-ember/15 font-medium text-ink" : "text-ink-secondary hover:text-ink")}
                  >
                    {t(`compose.view.${v}`)}
                  </button>
                ))}
              </div>
              {view === "filled" && rows.length > 0 && (
                <select value={previewFor} onChange={(e) => setPreviewFor(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink">
                  {rows.map((r) => (
                    <option key={r.participantId} value={r.participantId}>
                      {r.participantName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="border-b border-mist pb-2 text-[15px] font-semibold text-ink">{shown?.subject || "—"}</div>
            <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">{shown?.body || "—"}</div>
            {view === "filled" && <p className="text-[11.5px] text-ink-secondary">{t("statusUpdate.previewHint")}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
