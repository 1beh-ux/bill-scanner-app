"use client";

import { useEffect, useState } from "react";

// Nastavení akce -> Pošta, under an e-mail template: the event's documents this e-mail carries
// (src/lib/email-attachments.ts). Fixed = the same file for everyone; else generated per participant.
type T = (key: string, vars?: Record<string, string>) => string;
type Doc = { id: string; name: string; fixed: boolean };

export default function TemplateAttachments({ eventId, purposeKey, t }: { eventId: string; purposeKey: string; t: T }) {
  const url = `/api/events/${eventId}/email-attachments`;
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { documents: Doc[]; attachments: Record<string, string[]> } | null) => {
        if (!d) return;
        setDocs(d.documents);
        setPicked(new Set(d.attachments[purposeKey] ?? []));
      })
      .catch(() => {});
  }, [url, purposeKey]);

  async function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setFailed(false);
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purposeKey, ids: [...next] }) }).catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      setPicked(picked);
    }
  }

  if (!docs) return null;
  return (
    <div className="mb-3 rounded-lg border border-mist p-3">
      <p className="text-[13px] font-medium text-ink">{t("templateAttachments.title")}</p>
      <p className="mb-2 text-[12px] text-ink-secondary">{t("templateAttachments.hint")}</p>
      {docs.length === 0 && <p className="text-[12.5px] text-ink-secondary">{t("templateAttachments.none")}</p>}
      {docs.map((d) => (
        <label key={d.id} className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
          {d.name}
          <span className="text-[11.5px] text-ink-secondary">({t(d.fixed ? "templateAttachments.fixed" : "templateAttachments.generated")})</span>
        </label>
      ))}
      {failed && <p className="text-[12.5px] text-red-600">{t("emailTemplateAdmin.errorSaveFailed")}</p>}
    </div>
  );
}
