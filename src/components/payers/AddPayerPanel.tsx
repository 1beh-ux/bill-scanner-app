"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { createPayer, attachPayer, type Payer, type SimilarPayer } from "@/lib/payers-client";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// Create a new payer for an event (name + optional bank details). If a payer
// with a similar name already exists the server says so (names only) and this
// offers to use that one instead, or to create the new one anyway.
export default function AddPayerPanel({
  eventId,
  initialName = "",
  onDone,
  onCancel,
}: {
  eventId: string;
  initialName?: string;
  onDone: (payer: Payer) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const [name, setName] = useState(initialName);
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarPayer[]>([]);

  async function submit(confirmSimilar: boolean) {
    setBusy(true);
    setError(null);
    const res = await createPayer(eventId, { name, account, code }, confirmSimilar);
    setBusy(false);
    if (res.ok) return onDone(res.data);
    if (res.error === "similar_payer_exists") {
      setSimilar((res.extra?.similar as SimilarPayer[]) ?? []);
      return;
    }
    setError(res.error);
  }

  async function useExisting(p: SimilarPayer) {
    setBusy(true);
    const res = await attachPayer(eventId, p.id);
    setBusy(false);
    if (res.ok) onDone(res.data);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mist bg-paper p-3">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSimilar([]);
        }}
        placeholder={t("payers.nameLabel")}
        className={inputClass}
      />
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <input type="text" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t("payers.accountLabel")} className={inputClass} />
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("payers.bankCodeLabel")} className={inputClass} />
      </div>
      <p className="text-[12px] text-ink-secondary">{t("payers.bankOptionalHint")}</p>

      {similar.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[13px] text-amber-900">
          <p className="mb-1 font-medium">{t("payers.similarTitle")}</p>
          <ul className="mb-2 flex flex-col gap-1">
            {similar.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>{s.canonicalName}</span>
                <button type="button" onClick={() => useExisting(s)} disabled={busy} className="text-ember hover:underline">
                  {t("payers.useExisting")}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => submit(true)} disabled={busy} className="text-[13px] text-ink-secondary hover:underline">
            {t("payers.createAnyway")}
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-red-600">{t(`payers.error.${error}`)}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={() => submit(false)} disabled={busy || !name.trim()} className={btnPrimary}>
          {busy ? t("common.loading") : t("payers.create")}
        </button>
      </div>
    </div>
  );
}
