"use client";

import { useEffect, useState } from "react";
import PriceSettings from "@/components/events/PriceSettings";

// Nastavení akce -> "Platba a účet": everything about paying for the event in one place --
// prices + the payment account, the variable-symbol formula, the QR size in documents,
// "Dokument platby" and the automatic bank check (docs/bank-payments-design.md; any
// event, connected to the parent portal or not), then the special price rules.
type Ev = {
  startDate: string;
  priceRules: unknown;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
  registrationBankAccountNumber: string | null;
  registrationBankCode: string | null;
  vsYear?: number | null;
  vsEventType?: number | null;
  vsOrderInYear?: number | null;
  vsMembershipFieldKey?: string | null;
  qrSizeMm?: number | null;
  paymentDocTypeId: string | null;
  bankCheckEnabled: boolean;
  bankAccountId: string | null;
};
type T = (key: string, vars?: Record<string, string>) => string;

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const norm = (v: string | null) => (v ?? "").replace(/\s/g, "");

export default function PaymentSettings({ eventId, event, isAdmin, onSaved, t }: { eventId: string; event: Ev; isAdmin: boolean; onSaved: () => void; t: T }) {
  const [memberPrice, setMemberPrice] = useState(event.memberPriceCzk != null ? String(event.memberPriceCzk) : "");
  const [nonMemberPrice, setNonMemberPrice] = useState(event.nonMemberPriceCzk != null ? String(event.nonMemberPriceCzk) : "");
  const [account, setAccount] = useState(event.registrationBankAccountNumber ?? "");
  const [bankCode, setBankCode] = useState(event.registrationBankCode ?? "");
  const [vsYear, setVsYear] = useState(event.vsYear == null ? "" : String(event.vsYear).padStart(2, "0"));
  const [vsEventType, setVsEventType] = useState(String(event.vsEventType ?? 0));
  const [vsOrderInYear, setVsOrderInYear] = useState(String(event.vsOrderInYear ?? 0));
  const [vsMembershipFieldKey, setVsMembershipFieldKey] = useState(event.vsMembershipFieldKey ?? "");
  const [qrSizeMm, setQrSizeMm] = useState(String(event.qrSizeMm ?? 35));
  const [paymentDocTypeId, setPaymentDocTypeId] = useState(event.paymentDocTypeId ?? "");
  const [bankCheck, setBankCheck] = useState(event.bankCheckEnabled);
  const [bankAccountId, setBankAccountId] = useState(event.bankAccountId ?? "");
  const [docTypes, setDocTypes] = useState<{ id: string; name: string }[]>([]);
  const [booleanFields, setBooleanFields] = useState<{ key: string; label: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; label: string; accountNumber: string; bankCode: string; tokenSetAt: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/list-items?kind=document`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocTypes)
      .catch(() => {});
    fetch(`/api/events/${eventId}/participant-fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { key: string; label: string; kind: string; fieldType: string }[]) => setBooleanFields(rows.filter((f) => f.kind === "custom" && f.fieldType === "boolean")))
      .catch(() => {});
    fetch("/api/bank-accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d) => setBankAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [eventId]);

  // Only the organization's connected Fio accounts equal to the account typed above qualify.
  const matchingAccounts = bankAccounts.filter((a) => a.tokenSetAt && a.accountNumber === norm(account) && a.bankCode === norm(bankCode));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberPriceCzk: numOrNull(memberPrice),
        nonMemberPriceCzk: numOrNull(nonMemberPrice),
        registrationBankAccountNumber: account.trim() || null,
        registrationBankCode: bankCode.trim() || null,
        vsYear: vsYear.trim() === "" ? null : Number(vsYear) || 0,
        vsEventType: Number(vsEventType) || 0,
        vsOrderInYear: Number(vsOrderInYear) || 0,
        vsMembershipFieldKey: vsMembershipFieldKey || null,
        qrSizeMm: Number(qrSizeMm) || 35,
        // Admin-only part (the API refuses it for others).
        ...(isAdmin && {
          paymentDocTypeId: paymentDocTypeId || null,
          bankCheckEnabled: !!paymentDocTypeId && bankCheck && !!bankAccountId,
          bankAccountId: bankAccountId || null,
        }),
      }),
    });
    setSaving(false);
    const error = res.ok ? null : ((await res.json().catch(() => ({}))) as { error?: string }).error;
    setMessage({ ok: res.ok, text: res.ok ? t("paymentSettings.saved") : error?.startsWith("bank_check_") ? t(`bankCheck.${error}`) : t("feeSettings.errorSaveFailed") });
    if (res.ok) onSaved();
  }

  // Live example of the composed variable symbol (year from the start date unless overridden).
  const year = vsYear.trim() !== "" ? String((Number(vsYear) || 0) % 100).padStart(2, "0") : String(new Date(event.startDate).getUTCFullYear() % 100).padStart(2, "0");
  const head = `${year}${String(Number(vsEventType) || 0).slice(-1)}${String(Number(vsOrderInYear) || 0).slice(-1)}`;

  const h3 = "mb-2 text-[15px] font-semibold text-ink";
  const label = "text-[13px] text-ink-secondary";
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex max-w-md flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className={h3}>{t("paymentSettings.priceTitle")}</h3>
          <label className={label}>
            {t("feeSettings.memberPriceLabel")}
            <input type="number" value={memberPrice} onChange={(e) => setMemberPrice(e.target.value)} className={inputClass + " mt-1"} />
          </label>
          <label className={label}>
            {t("feeSettings.nonMemberPriceLabel")}
            <input type="number" value={nonMemberPrice} onChange={(e) => setNonMemberPrice(e.target.value)} className={inputClass + " mt-1"} />
          </label>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className={label}>
              {t("feeSettings.bankAccountLabel")}
              <input value={account} onChange={(e) => setAccount(e.target.value)} className={inputClass + " mt-1"} />
            </label>
            <label className={label}>
              {t("feeSettings.bankCodeLabel")}
              <input value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={inputClass + " mt-1"} />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={h3}>{t("paymentSettings.vsTitle")}</h3>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[12px] text-ink-secondary">
              {t("participantFieldAdmin.vsYearLabel")}
              <input type="number" min={0} max={99} value={vsYear} placeholder={year} onChange={(e) => setVsYear(e.target.value)} className={inputClass + " mt-1"} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("participantFieldAdmin.vsEventTypeLabel")}
              <input type="number" min={0} max={9} value={vsEventType} onChange={(e) => setVsEventType(e.target.value)} className={inputClass + " mt-1"} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("participantFieldAdmin.vsOrderInYearLabel")}
              <input type="number" min={0} max={9} value={vsOrderInYear} onChange={(e) => setVsOrderInYear(e.target.value)} className={inputClass + " mt-1"} />
            </label>
          </div>
          <label className="text-[12px] text-ink-secondary">
            {t("participantFieldAdmin.vsMembershipFieldLabel")}
            <select value={vsMembershipFieldKey} onChange={(e) => setVsMembershipFieldKey(e.target.value)} className={inputClass + " mt-1"}>
              <option value="">{t("common.none")}</option>
              {booleanFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.vsMembershipValuesHint")}</p>
          <p className="rounded-lg bg-paper px-3 py-2 font-mono text-[13px] text-ink-secondary">
            {t("participantFieldAdmin.vsPreviewNonMember")} {head}00001 · {t("participantFieldAdmin.vsPreviewMember")} {head}10001
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={h3}>{t("paymentSettings.qrTitle")}</h3>
          <label className={"max-w-[220px] " + label}>
            {t("participantFieldAdmin.qrSizeLabel")}
            <input type="number" min={10} max={150} value={qrSizeMm} onChange={(e) => setQrSizeMm(e.target.value)} className={inputClass + " mt-1"} />
          </label>
          <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.qrSizeHint")}</p>
        </section>

        {isAdmin && (
          <section className="flex flex-col gap-2">
            <h3 className={h3}>{t("paymentSettings.confirmTitle")}</h3>
            <label className={label}>
              {t("paymentDoc.label")}
              <select value={paymentDocTypeId} onChange={(e) => setPaymentDocTypeId(e.target.value)} className={inputClass + " mt-1"}>
                <option value="">{t("paymentDoc.none")}</option>
                {docTypes.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11.5px]">{t("paymentDoc.hint")}</span>
            </label>
            {paymentDocTypeId && (
              <div className="flex flex-col gap-1 rounded-lg border border-mist p-2">
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={bankCheck} onChange={(e) => setBankCheck(e.target.checked)} disabled={!matchingAccounts.length} className="h-4 w-4 accent-ember" />
                  {t("bankCheck.eventSwitch")}
                </label>
                {matchingAccounts.length ? (
                  <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputClass}>
                    <option value="">{t("bankCheck.pickAccount")}</option>
                    {matchingAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label} ({a.accountNumber}/{a.bankCode})</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11.5px] text-ink-secondary">{t("bankCheck.noMatchingAccount")}</span>
                )}
              </div>
            )}
          </section>
        )}

        {message && <p className={"text-[13px] " + (message.ok ? "text-pine" : "text-red-600")}>{message.text}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={btnPrimary}>{t("common.save")}</button>
        </div>
      </form>
      <PriceSettings key={eventId} eventId={eventId} event={event} onSaved={onSaved} t={t} />
    </div>
  );
}
