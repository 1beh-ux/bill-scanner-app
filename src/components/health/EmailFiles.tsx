"use client";

import { useEffect, useRef, useState } from "react";

// Under every e-mail template: uploaded files this e-mail carries (src/lib/email-files.ts) -- the
// organization's go with every send, an event's only with that event's (shown with the organization's).
type T = (key: string, vars?: Record<string, string>) => string;
type F = { id: string; name: string; size: number };

export default function EmailFiles({ eventId, purposeKey, t }: { eventId?: string; purposeKey: string; t: T }) {
  const url = `/api/email-files?purposeKey=${encodeURIComponent(purposeKey)}${eventId ? `&eventId=${eventId}` : ""}`;
  const [files, setFiles] = useState<F[] | null>(null);
  const [orgFiles, setOrgFiles] = useState<F[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setFiles(d.files);
        setOrgFiles(d.orgFiles);
      })
      .catch(() => {});
  }, [url]);

  async function call(init: RequestInit, extra = "") {
    setBusy(true);
    setError(null);
    const res = await fetch(url + extra, init).catch(() => null);
    setBusy(false);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d) setFiles(d.files);
    else setError(t(d?.error === "too_large" ? "emailFiles.tooLarge" : d?.error === "too_many" ? "emailFiles.tooMany" : "emailTemplateAdmin.errorSaveFailed"));
  }

  function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    call({ method: "POST", body: form });
    if (input.current) input.current.value = "";
  }

  if (!files) return null;
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} kB`;
  return (
    <div className="mb-3 rounded-lg border border-mist p-3">
      <p className="text-[13px] font-medium text-ink">{t("emailFiles.title")}</p>
      <p className="mb-2 text-[12px] text-ink-secondary">{t(eventId ? "emailFiles.hintEvent" : "emailFiles.hint")}</p>
      {orgFiles.map((f) => (
        <p key={f.id} className="text-[13.5px] text-ink-secondary">
          {f.name} <span className="text-[11.5px]">({kb(f.size)}, {t("emailFiles.fromOrg")})</span>
        </p>
      ))}
      {files.map((f) => (
        <p key={f.id} className="flex items-center gap-2 text-[13.5px] text-ink">
          {f.name} <span className="text-[11.5px] text-ink-secondary">({kb(f.size)})</span>
          <button type="button" disabled={busy} onClick={() => call({ method: "DELETE" }, `&id=${f.id}`)} className="text-[12px] text-red-600 hover:underline">
            {t("emailFiles.remove")}
          </button>
        </p>
      ))}
      <label className="mt-1 inline-block cursor-pointer text-[13px] text-ember hover:underline">
        + {t("emailFiles.add")}
        <input ref={input} type="file" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {error && <p className="text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
