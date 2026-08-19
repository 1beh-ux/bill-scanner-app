"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

const selectClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "shrink-0 rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type MailAccount = { email: string; scope: string | null };

const MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export default function SenderEmailField({
  eventId,
  purpose = "health",
}: {
  eventId: string;
  purpose?: "health" | "mail";
}) {
  const { t } = useTranslations();
  const url = `/api/events/${eventId}/health/sender-email`;

  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    const [fieldRes, accountsRes] = await Promise.all([fetch(url), fetch("/api/mail-accounts")]);
    if (fieldRes.ok) {
      setSenderEmail((await fieldRes.json()).senderEmail);
    } else {
      setError(t("senderEmailField.errorLoadFailed"));
    }
    if (accountsRes.ok) setConnectedAccounts(await accountsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handlePick(email: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail: email }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("senderEmailField.errorSaveFailed"));
      return;
    }
    setSenderEmail(email);
    setSaved(true);
  }

  if (loading) {
    return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  }

  const selectedAccount = connectedAccounts.find((a) => a.email === senderEmail) ?? null;
  const isConnected = selectedAccount !== null;
  const needsReconnect =
    purpose === "mail" && isConnected && !(selectedAccount?.scope ?? "").includes(MODIFY_SCOPE);

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("senderEmailField.title")}</h3>
      <p className="mb-3 text-[13px] text-ink-secondary">{t("senderEmailField.hint")}</p>

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {!senderEmail && !error && (
        <p className="mb-3 text-[13px] text-amber-600">{t("senderEmailField.notConfiguredWarning")}</p>
      )}
      {senderEmail && !isConnected && !error && (
        <p className="mb-3 text-[13px] text-amber-600">
          {t("senderEmailField.setButNotConnectedWarning", { email: senderEmail })}
        </p>
      )}
      {senderEmail && isConnected && !needsReconnect && (
        <p className="mb-3 text-[13px] text-green-600">{t("senderEmailField.connectedStatus", { email: senderEmail })}</p>
      )}
      {needsReconnect && (
        <p className="mb-3 text-[13px] text-amber-600">
          {t("senderEmailField.needsReconnectWarning", { email: senderEmail ?? "" })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {connectedAccounts.length > 0 && (
          <select
            value={senderEmail ?? ""}
            onChange={(e) => e.target.value && handlePick(e.target.value)}
            disabled={saving}
            className={selectClass}
          >
            <option value="" disabled>
              {t("senderEmailField.pickPlaceholder")}
            </option>
            {connectedAccounts.map((a) => (
              <option key={a.email} value={a.email}>
                {a.email}
              </option>
            ))}
          </select>
        )}
        <a href={`/api/mail-oauth/authorize?eventId=${eventId}&purpose=${purpose}`} className={btnPrimary}>
          {needsReconnect ? t("senderEmailField.reconnectButton") : t("senderEmailField.connectNewButton")}
        </a>
      </div>
      {saved && <p className="mt-2 text-[13px] text-green-600">{t("senderEmailField.saved")}</p>}
    </div>
  );
}
