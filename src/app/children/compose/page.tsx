"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { readPortalComposeIds } from "@/components/children/portal-link";
import { PORTAL_INVITATION_PURPOSE_KEY, PORTAL_LINK_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { templateVariablesFor } from "@/lib/email-template-preview";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type Info = { subject: string; body: string; senderEmail: string | null; children: { id: string; name: string; emails: string[] }[] };
type Outcome = { sent: number; failed: number; noRecipients: number };

// Send the parent-portal link (docs/registration-portal-spec.md F): editing on
// the left, the e-mail filled in for one real child on the right (server-side,
// same code as the send). Nothing goes out until "Odeslat" + the confirm.
export default function PortalLinkComposePage() {
  const { t, role, roleLoaded } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [childIds, setChildIds] = useState<string[] | null>(null);
  // Which org template to start from (slice 4 #12): the link or the yearly invitation.
  const [purposeKey, setPurposeKey] = useState(PORTAL_LINK_PURPOSE_KEY);
  const [info, setInfo] = useState<Info | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [previewFor, setPreviewFor] = useState("");
  const [preview, setPreview] = useState<{ subject: string; body: string; recipients: string[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (roleLoaded && role !== "admin") router.replace("/events");
  }, [roleLoaded, role, router]);

  useEffect(() => {
    const ids = readPortalComposeIds(new URLSearchParams(window.location.search));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChildIds(ids);
    setPreviewFor((prev) => prev || ids[0] || "");
    if (ids.length === 0) return;
    fetch("/api/children/portal-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "info", childIds: ids, purposeKey }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Info | null) => {
        if (!d) return;
        setInfo(d);
        setSubject(d.subject);
        setBody(d.body);
      })
      .catch(() => {});
  }, [purposeKey]);

  // Filled-in preview, re-rendered on the server as the text changes.
  useEffect(() => {
    if (!previewFor || !info) return;
    const handle = setTimeout(() => {
      fetch("/api/children/portal-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", childId: previewFor, subject, body, noLinkYet: t("portalCompose.linkCreatedOnSend") }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [previewFor, subject, body, info, t]);

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
  }

  async function send() {
    if (!info) return;
    const withRecipients = info.children.filter((c) => c.emails.length > 0).length;
    if (!(await confirm({ message: t("portalCompose.confirmSend", { count: String(withRecipients) }), confirmLabel: t("portalCompose.send") }))) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/children/portal-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", childIds: info.children.map((c) => c.id), subject, body, purposeKey }),
    });
    setSending(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error === "sender_not_connected" ? t("portalCompose.noSender") : t("composeEmailModal.sendFailed"));
    }
    setOutcome(await res.json());
  }

  if (!roleLoaded || role !== "admin") return null;
  const back = (
    <Link href="/children" className="text-[13px] text-ink-secondary hover:text-ink">
      ← {t("children.title")}
    </Link>
  );

  if (outcome) {
    const warn = outcome.failed > 0 || outcome.noRecipients > 0;
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {back}
        <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">{t("portalCompose.title")}</h1>
        <p className={"rounded-lg border px-3 py-2 text-[14px] " + (warn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-pine/40 bg-pine/10 text-pine")}>
          {t("portalCompose.done", { sent: String(outcome.sent), failed: String(outcome.failed), none: String(outcome.noRecipients) })}
        </p>
      </div>
    );
  }
  if (childIds && childIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {back}
        <p className="mt-4 text-[14px] text-ink-secondary">{t("compose.noneSelected")}</p>
      </div>
    );
  }
  if (!info) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {back}
      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">{t("portalCompose.title")}</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-mist bg-paper-2 p-3 text-[13px]">
            <p className="mb-1 font-medium text-ink">{t("composeEmailModal.recipientCount", { count: String(info.children.length) })}</p>
            <ul className="scrollbar-app flex max-h-40 flex-col gap-0.5 overflow-y-auto text-ink-secondary">
              {info.children.map((c) => (
                <li key={c.id} className={c.emails.length ? "" : "text-amber-700"}>
                  {c.name} — {c.emails.length ? c.emails.join(", ") : `⚠ ${t("composeEmailModal.noRecipientEmail")}`}
                </li>
              ))}
            </ul>
          </section>
          <p className={"text-[12.5px] " + (info.senderEmail ? "text-ink-secondary" : "text-red-600")}>
            {info.senderEmail ? t("portalCompose.from", { email: info.senderEmail }) : t("portalCompose.noSender")}
          </p>
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-secondary">
            {t("portalCompose.purposeLabel")}
            <select
              value={purposeKey}
              onChange={async (e) => {
                const next = e.target.value;
                if (info && (subject !== info.subject || body !== info.body) && !(await confirm({ message: t("portalCompose.purposeSwitchConfirm") }))) return;
                setPurposeKey(next);
              }}
              className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink"
            >
              {[PORTAL_LINK_PURPOSE_KEY, PORTAL_INVITATION_PURPOSE_KEY].map((k) => (
                <option key={k} value={k}>
                  {t(`portalCompose.purpose.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[12px] text-ink-secondary">
            {t("compose.templateOrg")}{" "}
            <Link href="/templates" className="text-ember hover:underline">
              {t("compose.editTemplate")}
            </Link>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templateVariablesFor(purposeKey).map((v) => (
              <button
                key={v}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVariable(v)}
                className="rounded-full border border-mist bg-paper-2 px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-mist"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("composeEmailModal.subjectPlaceholder")} className={inputClass} />
          <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={14} placeholder={t("composeEmailModal.bodyPlaceholder")} className={inputClass + " font-mono text-[13px]"} />
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div>
            <button onClick={send} disabled={sending || !info.senderEmail || !subject.trim() || !body.trim()} className={btnPrimary}>
              {sending ? t("common.loading") : t("portalCompose.sendButton", { count: String(info.children.length) })}
            </button>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 self-start rounded-lg border border-mist bg-paper p-4 lg:sticky lg:top-4">
          {info.children.length > 1 && (
            <select value={previewFor} onChange={(e) => setPreviewFor(e.target.value)} className="self-start rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink">
              {info.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {preview && (
            <p className="text-[12px] text-ink-secondary">
              {t("compose.to")}: {preview.recipients.join(", ") || "—"}
            </p>
          )}
          <div className="border-b border-mist pb-2 text-[15px] font-semibold text-ink">{(preview ?? { subject }).subject || "—"}</div>
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">{(preview ?? { body }).body || "—"}</div>
          <p className="text-[11.5px] text-ink-secondary">{t("compose.previewHint")}</p>
        </aside>
      </div>
    </div>
  );
}
