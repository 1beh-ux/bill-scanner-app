"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { readComposeIds, type ComposeMode } from "@/lib/compose-handoff";
import { REGISTRATION_ACCEPTANCE_PURPOSE_KEY, PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type DocType = { id: string; name: string };
type Recipient = { id: string; name: string; email: string | null };
type Outcome = { sentCount: number; failedCount: number; documentsGenerated: number; documentFailures: string[]; emailSkipped: boolean };

// Accept registration / e-mail participants: editing on the left, the e-mail
// on the right -- as the template (with {{variables}}) or filled in for one
// real participant exactly as the send will do it (server-side, same code).
export default function ComposePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const query = useSearchParams();
  const mode: ComposeMode = query.get("mode") === "freeform" ? "freeform" : "acceptance";
  const regenerate = query.get("regenerate") === "1";
  const purposeKey = mode === "acceptance" ? REGISTRATION_ACCEPTANCE_PURPOSE_KEY : PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY;

  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateSource, setTemplateSource] = useState<"event" | "org" | null>(null);
  const [loading, setLoading] = useState(mode === "acceptance");
  const [sendEmail, setSendEmail] = useState(!(mode === "acceptance" && regenerate));
  const emailOn = mode === "freeform" || sendEmail;
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const [view, setView] = useState<"filled" | "template">("filled");
  const [previewFor, setPreviewFor] = useState<string>("");
  const [preview, setPreview] = useState<{ subject: string; body: string; recipients: string[] } | null>(null);

  useEffect(() => {
    const ids = readComposeIds(new URLSearchParams(window.location.search));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticipantIds(ids);
    setPreviewFor(ids[0] ?? "");
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all: { id: string; name: string; computed: { contact_email: string | null } }[]) => {
        const byId = new Map(all.map((p) => [p.id, p]));
        setRecipients(ids.map((pid) => ({ id: pid, name: byId.get(pid)?.name ?? pid, email: byId.get(pid)?.computed.contact_email ?? null })));
      })
      .catch(() => setRecipients([]));
  }, [eventId]);

  useEffect(() => {
    if (mode !== "acceptance") return;
    fetch(`/api/events/${eventId}/email-template?purposeKey=${encodeURIComponent(purposeKey)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setSubject(data.subject);
        setBody(data.body);
        setTemplateSource(data.hasOverride ? "event" : "org");
      })
      .finally(() => setLoading(false));
    fetch(`/api/events/${eventId}/list-items?kind=document&all=false`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: { id: string; name: string; data?: { templateGoogleDocId?: string; autoAttachOnAccept?: boolean } | null }[]) => {
        const eligible = items.filter((i) => i.data?.templateGoogleDocId);
        setDocTypes(eligible.map((i) => ({ id: i.id, name: i.name })));
        setSelectedDocs(new Set(eligible.filter((i) => i.data?.autoAttachOnAccept).map((i) => i.id)));
      })
      .catch(() => {});
  }, [eventId, mode, purposeKey]);

  const docKey = useMemo(() => [...selectedDocs].sort().join(","), [selectedDocs]);

  // Filled-in preview, re-rendered on the server as the text changes.
  useEffect(() => {
    if (!previewFor || !emailOn) return;
    const handle = setTimeout(() => {
      fetch(`/api/events/${eventId}/participants/email-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: previewFor,
          subject,
          body,
          markAccepted: mode === "acceptance",
          autoAttachDocumentTypeIds: mode === "acceptance" ? docKey.split(",").filter(Boolean) : undefined,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [eventId, previewFor, subject, body, docKey, mode, emailOn]);

  function toggleDoc(docId: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function handleSend() {
    if (emailOn && (!subject.trim() || !body.trim())) return;
    setSending(true);
    setSendError(false);
    const form = new FormData();
    form.set("participantIds", JSON.stringify(participantIds));
    form.set("subject", subject);
    form.set("body", body);
    form.set("purposeKey", purposeKey);
    form.set("markAccepted", String(mode === "acceptance"));
    form.set("sendEmail", String(emailOn));
    if (mode === "acceptance") form.set("autoAttachDocumentTypeIds", JSON.stringify([...selectedDocs]));
    if (attachment) form.set("attachment", attachment);
    try {
      const res = await fetch(`/api/events/${eventId}/participants/bulk-email`, { method: "POST", body: form });
      if (!res.ok) return setSendError(true);
      const d = await res.json();
      setOutcome({
        sentCount: d.sentCount,
        failedCount: d.failedCount,
        documentsGenerated: d.documentsGenerated ?? 0,
        documentFailures: d.documentFailures ?? [],
        emailSkipped: !emailOn,
      });
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  const title =
    mode === "acceptance"
      ? t(regenerate ? "composeEmailModal.titleRegenerate" : "composeEmailModal.titleAcceptance")
      : t("composeEmailModal.titleFreeform");
  const backLink = (
    <Link href={`/events/${eventId}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
      ← {t("participantsPage.centralTitle")}
    </Link>
  );

  if (outcome) {
    const warn = outcome.failedCount > 0 || outcome.documentFailures.length > 0;
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {backLink}
        <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">{title}</h1>
        <p className={"rounded-lg border px-3 py-2 text-[14px] " + (warn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-pine/40 bg-pine/10 text-pine")}>
          {outcome.emailSkipped
            ? t("composeEmailModal.docsRegenerated", { count: String(outcome.documentsGenerated) })
            : t("composeEmailModal.sendDone", { sent: String(outcome.sentCount), failed: String(outcome.failedCount) })}
          {outcome.documentFailures.length > 0 && " " + t("composeEmailModal.docsFailed", { docs: outcome.documentFailures.join(", ") })}
        </p>
        <Link href={`/events/${eventId}/participants`} className={btnPrimary + " mt-4 inline-block"}>
          {t("compose.backToList")}
        </Link>
      </div>
    );
  }

  if (participantIds.length === 0 && recipients !== null) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {backLink}
        <p className="mt-4 text-[14px] text-ink-secondary">{t("compose.noneSelected")}</p>
      </div>
    );
  }

  const shown = view === "template" || !preview ? { subject, body } : preview;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {backLink}
      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">{title}</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: what gets sent */}
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-mist bg-paper-2 p-3 text-[13px]">
            <p className="mb-1 font-medium text-ink">{t("composeEmailModal.recipientCount", { count: String(participantIds.length) })}</p>
            {recipients && (
              <ul className="scrollbar-app flex max-h-40 flex-col gap-0.5 overflow-y-auto text-ink-secondary">
                {recipients.map((r) => (
                  <li key={r.id} className={r.email ? "" : "text-amber-700"}>
                    {r.name} — {r.email ?? `⚠ ${t("composeEmailModal.noRecipientEmail")}`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {loading ? (
            <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
          ) : (
            <>
              {mode === "acceptance" && (
                <label className="flex items-center gap-2 text-[14px] text-ink">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                  {t("composeEmailModal.sendEmailLabel")}
                </label>
              )}
              {emailOn && (
                <section className="flex flex-col gap-2">
                  {templateSource && (
                    <p className="text-[12px] text-ink-secondary">
                      {t(templateSource === "event" ? "compose.templateEvent" : "compose.templateOrg")}{" "}
                      <Link href={`/events/${eventId}?tab=ucastnici`} className="text-ember hover:underline">
                        {t("compose.editTemplate")}
                      </Link>
                    </p>
                  )}
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("composeEmailModal.subjectPlaceholder")} className={inputClass} />
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("composeEmailModal.bodyPlaceholder")} className={inputClass + " font-mono text-[13px]"} rows={16} />
                  <p className="text-[12px] text-ink-secondary">{t("composeEmailModal.variablesHint")}</p>
                </section>
              )}
              {mode === "acceptance" && docTypes.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <p className="text-[13px] text-ink-secondary">{t("composeEmailModal.autoAttachDocumentsLabel")}</p>
                  {docTypes.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-[14px] text-ink">
                      <input type="checkbox" checked={selectedDocs.has(d.id)} onChange={() => toggleDoc(d.id)} />
                      {d.name}
                    </label>
                  ))}
                </section>
              )}
              {emailOn && (
                <section className="text-[13px] text-ink-secondary">
                  <div className="mb-1">{t("composeEmailModal.attachmentLabel")}</div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist">
                      {t("incidentForm.choosePhoto")}
                      <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} className="hidden" />
                    </label>
                    <span className="truncate">{attachment ? attachment.name : t("composeEmailModal.noFileChosen")}</span>
                  </div>
                </section>
              )}
              {sendError && <p className="text-[13px] text-red-600">{t("composeEmailModal.sendFailed")}</p>}
              <div>
                <button
                  onClick={handleSend}
                  disabled={sending || participantIds.length === 0 || (emailOn && (!subject.trim() || !body.trim())) || (!emailOn && selectedDocs.size === 0)}
                  className={btnPrimary}
                >
                  {sending
                    ? t("common.loading")
                    : emailOn
                      ? t("composeEmailModal.sendButton", { count: String(participantIds.length) })
                      : t("composeEmailModal.generateButton", { count: String(participantIds.length) })}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: the e-mail as it will look */}
        {emailOn && !loading && (
          <aside className="flex flex-col gap-3 self-start rounded-lg border border-mist bg-paper p-4 lg:sticky lg:top-4">
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
              {view === "filled" && recipients && recipients.length > 1 && (
                <select value={previewFor} onChange={(e) => setPreviewFor(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink">
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {view === "filled" && preview && (
              <p className="text-[12px] text-ink-secondary">
                {t("compose.to")}: {preview.recipients.join(", ") || "—"}
              </p>
            )}
            <div className="border-b border-mist pb-2 text-[15px] font-semibold text-ink">{shown.subject || "—"}</div>
            <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink">{shown.body || "—"}</div>
            {view === "filled" && <p className="text-[11.5px] text-ink-secondary">{t("compose.previewHint")}</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
