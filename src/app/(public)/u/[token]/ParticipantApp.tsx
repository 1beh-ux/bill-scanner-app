"use client";

import { useCallback, useEffect, useState } from "react";
import FieldInput, { portalInputClass as inputClass } from "@/components/registration/FieldInput";
import { OrgFooter, OrgName, type PublicOrg } from "@/components/registration/OrgBrand";
import ThemeToggle from "@/components/registration/ThemeToggle";
import { MarkdownText } from "@/components/registration/Markdown";

// A participant's own page for one event (src/lib/participant-link.ts): the birth date first (kept for
// this tab only), then the event's fields to fill in, the payment and the documents to upload.
type T = (key: string, vars?: Record<string, string>) => string;
type Field = { key: string; label: string; fieldType: string; options: unknown; value: string };
type Data = {
  event: { name: string; startDate: string; endDate: string; location: string | null; info: string | null };
  name: string;
  accepted: boolean;
  fields: Field[];
  payment: { priceCzk: number | null; account: string | null; variableSymbol: string; qrDataUrl: string | null; paid: boolean | null } | null;
  documents: { typeId: string; name: string; received: boolean; pending: boolean; canUpload: boolean }[];
};
const card = "rounded-lg border border-mist bg-paper p-4";
const btnPrimary = "rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const date = (d: string) => new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const KEY = (token: string) => `u-gate:${token}`;

export default function ParticipantApp({ token, org, strings }: { token: string; org: PublicOrg; strings: Record<string, string> }) {
  const t: T = useCallback((key, vars) => {
    let s = strings[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
    return s;
  }, [strings]);
  const api = `/api/public/u/${token}`;
  const [birthDate, setBirthDate] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const headers = (dob: string) => ({ "x-birth-date": dob });

  const load = useCallback(async (dob: string) => {
    const res = await fetch(api, { headers: headers(dob), cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setGateError(t(res?.status === 429 ? "portal.gateThrottled" : res?.status === 403 ? "portal.gateWrong" : "portal.unavailable"));
      try { sessionStorage.removeItem(KEY(token)); } catch {}
      return;
    }
    const d = (await res.json()) as Data;
    try { sessionStorage.setItem(KEY(token), dob); } catch {}
    setData(d);
    setValues(Object.fromEntries(d.fields.map((f) => [f.key, f.value])));
  }, [api, t, token]);

  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem(KEY(token)) ?? ""; } catch {}
    if (saved) {
      setBirthDate(saved);
      load(saved);
    }
  }, [load, token]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(api, { method: "POST", headers: { ...headers(birthDate), "Content-Type": "application/json" }, body: JSON.stringify({ answers: values }) }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "portal.saved" : res?.status === 400 ? "portal.laterInvalid" : "portal.saveFailed"));
    if (res?.ok) load(birthDate);
  }
  async function upload(typeId: string, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set("docTypeId", typeId);
    form.set("file", file);
    const res = await fetch(`${api}/upload`, { method: "POST", headers: headers(birthDate), body: form }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "portal.uploadDone" : res?.status === 400 ? "portal.uploadBadFile" : "portal.uploadFailed"));
    if (res?.ok) load(birthDate);
  }

  return (
    <div className="pub-container mx-auto w-full max-w-2xl p-4 pb-16">
      <ThemeToggle label={t("portal.toggleTheme")} />
      <OrgName org={org} />
      {!data ? (
        <form onSubmit={(e) => { e.preventDefault(); setGateError(null); load(birthDate); }} className={card + " mx-auto mt-6 flex max-w-md flex-col gap-3"}>
          <h1 className="text-[20px] font-semibold text-ink">{t("participantPage.gateTitle")}</h1>
          <p className="text-[14px] text-ink-secondary">{t("participantPage.gateHint")}</p>
          <input type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputClass} aria-label={t("portal.gateLabel")} />
          {gateError && <p className="text-[14px] text-red-600">{gateError}</p>}
          <button type="submit" disabled={!birthDate} className={btnPrimary}>{t("portal.gateSubmit")}</button>
        </form>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <h1 className="text-[24px] font-semibold text-ink">{data.name}</h1>
            <p className="text-[14px] text-ink-secondary">
              {data.event.name} · {date(data.event.startDate)} – {date(data.event.endDate)}
              {data.event.location && ` · ${data.event.location}`}
            </p>
          </div>
          {data.event.info && <MarkdownText text={data.event.info} className={card + " text-[15px] text-ink"} />}
          {data.fields.length > 0 && (
            <section className={card + " flex flex-col gap-3"}>
              <h2 className="text-[16px] font-semibold text-ink">{t("participantPage.detailsTitle")}</h2>
              {data.fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                  <span>{f.label}{f.fieldType !== "boolean" && " *"}</span>
                  <FieldInput field={f} value={values[f.key] ?? ""} required={f.fieldType !== "boolean"} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} yesLabel={t("portal.yes")} />
                </label>
              ))}
              <button type="button" onClick={save} disabled={busy} className={btnPrimary + " self-start"}>{t("portal.save")}</button>
            </section>
          )}
          {data.payment && (
            <section className={card + " flex flex-col gap-1 text-[14px] text-ink"}>
              <h2 className="text-[16px] font-semibold">{t("participantPage.paymentTitle")}</h2>
              {data.payment.paid === true ? (
                <p className="text-pine">{t("portal.paid")}</p>
              ) : (
                <>
                  {data.payment.priceCzk != null && <p>{t("participantPage.amount", { amount: String(data.payment.priceCzk) })}</p>}
                  {data.payment.account && <p>{t("participantPage.account", { account: data.payment.account })}</p>}
                  {data.payment.variableSymbol && <p>{t("participantPage.vs", { vs: data.payment.variableSymbol })}</p>}
                  {data.payment.qrDataUrl && <img src={data.payment.qrDataUrl} alt="QR" className="mt-2 h-40 w-40 rounded bg-white p-1" />}
                </>
              )}
            </section>
          )}
          {data.documents.length > 0 && (
            <section className={card + " flex flex-col gap-2"}>
              <h2 className="text-[16px] font-semibold text-ink">{t("participantPage.documentsTitle")}</h2>
              {data.documents.map((d) => (
                <div key={d.typeId} className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-ink">
                  <span>{d.name}</span>
                  {d.received ? (
                    <span className="text-pine">{t("participantPage.received")}</span>
                  ) : d.pending ? (
                    <span className="text-ink-secondary">{t("participantPage.pending")}</span>
                  ) : d.canUpload ? (
                    <label className="cursor-pointer rounded-lg border border-mist px-3 py-1.5 text-[13px] hover:bg-paper-2">
                      {t("participantPage.upload")}
                      <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" disabled={busy} onChange={(e) => upload(d.typeId, e.target.files?.[0])} />
                    </label>
                  ) : (
                    <span className="text-amber-700">{t("participantPage.missing")}</span>
                  )}
                </div>
              ))}
            </section>
          )}
          {message && <p className="text-[14px] text-ink">{message}</p>}
        </div>
      )}
      <OrgFooter org={org} label={t("portal.contact")} />
    </div>
  );
}
