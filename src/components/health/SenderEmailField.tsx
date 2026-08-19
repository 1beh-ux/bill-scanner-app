"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function SenderEmailField({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const url = `/api/events/${eventId}/health/sender-email`;

  const [senderEmail, setSenderEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSenderEmail(data.senderEmail ?? "");
        else setError(t("senderEmailField.errorLoadFailed"));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("senderEmailField.errorSaveFailed"));
      return;
    }
    setSaved(true);
  }

  if (loading) {
    return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  }

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("senderEmailField.title")}</h3>
      <p className="mb-3 text-[13px] text-ink-secondary">{t("senderEmailField.hint")}</p>

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {!senderEmail && !error && (
        <p className="mb-3 text-[13px] text-amber-600">{t("senderEmailField.notConfiguredWarning")}</p>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          value={senderEmail}
          onChange={(e) => {
            setSenderEmail(e.target.value);
            setSaved(false);
          }}
          placeholder="tabor2026@vasedoména.cz"
          className={inputClass}
        />
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
      {saved && <p className="mt-2 text-[13px] text-green-600">{t("senderEmailField.saved")}</p>}
    </div>
  );
}
