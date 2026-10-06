"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

// Lidé → person: permanent documents (docs/registration-slice6-spec.md 3, 5).
// Per "platí trvale" document type the current file + history, view /
// download, "Nahrát soubor" straight to the person store and "Neplatí".
type PersonDoc = { id: string; filename: string | null; createdAt: string; revokedAt: string | null; sourceEvent: string | null; current: boolean };
type DocType = { key: string; name: string; permanent: boolean; docs: PersonDoc[] };

const sectionTitle = "mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-secondary";
const date = (d: string) => new Date(d).toLocaleDateString("cs-CZ");

export default function PersonDocuments({ childId }: { childId: string }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [types, setTypes] = useState<DocType[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const api = `/api/children/${childId}/documents`;

  const load = () =>
    fetch(api)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTypes)
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function upload(key: string, file: File | undefined) {
    if (!file) return;
    setBusy(key);
    setMessage(null);
    const form = new FormData();
    form.set("key", key);
    form.set("file", file);
    const res = await fetch(api, { method: "POST", body: form }).catch(() => null);
    setBusy(null);
    if (!res?.ok) setMessage(t(res?.status === 400 ? "portal.uploadBadFile" : "portal.uploadFailed"));
    load();
  }

  // "Neplatí" (slice 6 #5): every event counts the type as missing again, past ones too.
  async function revoke(type: DocType, d: PersonDoc) {
    if (!(await confirm({ message: t("personDocs.revokeConfirm", { name: type.name }), confirmLabel: t("personDocs.revoke"), danger: true }))) return;
    setBusy(type.key);
    const res = await fetch(`${api}/${d.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke" }) }).catch(() => null);
    setBusy(null);
    setMessage(res?.ok ? null : t("children.errorFailed"));
    load();
  }

  if (!types.length) return null;
  return (
    <section>
      <h2 className={sectionTitle}>{t("personDocs.title")}</h2>
      <p className="-mt-1 mb-2 text-[12px] text-ink-secondary">{t("personDocs.hint")}</p>
      {message && <p className="mb-2 text-[13px] text-red-600">{message}</p>}
      <ul className="flex flex-col gap-1.5">
        {types.map((type) => (
          <li key={type.key} className="flex flex-col gap-1 rounded-lg border border-mist px-3 py-2 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                {type.name}
                {!type.permanent && <span className="ml-1.5 text-[12px] text-ink-secondary">({t("personDocs.notPermanent")})</span>}
              </span>
              {type.permanent && (
                <label className={"cursor-pointer text-[12.5px] text-ember hover:underline " + (busy === type.key ? "pointer-events-none opacity-50" : "")}>
                  {t("personDocs.upload")}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      upload(type.key, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
            {type.docs.length === 0 && <span className="text-[12.5px] text-amber-700">{t("personDocs.none")}</span>}
            {type.docs.map((d) => (
              <div key={d.id} className={"flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] " + (d.current ? "text-ink" : "text-ink-secondary")}>
                <span className={d.revokedAt ? "line-through" : ""}>
                  {date(d.createdAt)} · {d.filename ?? "—"} · {d.sourceEvent ? t("personDocs.fromEvent", { event: d.sourceEvent }) : t("personDocs.uploadedHere")}
                </span>
                {d.current && <span className="rounded bg-pine/15 px-1.5 text-pine">{t("personDocs.current")}</span>}
                {d.revokedAt && <span className="text-red-700">{t("personDocs.revokedOn", { date: date(d.revokedAt) })}</span>}
                <a href={`${api}/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                  {t("uploadReview.open")}
                </a>
                <a href={`${api}/${d.id}`} className="text-ember hover:underline">
                  {t("uploadReview.download")}
                </a>
                {!d.revokedAt && (
                  <button type="button" onClick={() => revoke(type, d)} disabled={busy === type.key} className="text-red-600 hover:underline disabled:opacity-50">
                    {t("personDocs.revoke")}
                  </button>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
