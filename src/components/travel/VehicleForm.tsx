"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";

// One car's fields (Vozidla page, and inline in the travel-order form). Owners: the people offered
// (an adult in Lidé and/or a payer); `allowFreeOwner` = a plain name too (organization admins).
export type Owner = { kind: "child" | "author"; id: string; name: string };
export type VehicleRow = {
  id: string;
  label: string;
  cylinderCc: number | null;
  plate: string | null;
  gearbox: "manual" | "automatic";
  fuel: "diesel" | "petrol95" | "petrol98" | "electric";
  tpConsumption1: string | null;
  tpConsumption2: string | null;
  tpConsumption3: string | null;
  tpConsumption4: string | null;
  ownerChildId: string | null;
  ownerAuthorId: string | null;
  ownerName: string | null;
  createdByUserId: string | null;
  archivedAt: string | null;
  ownerChild: { id: string; name: string } | null;
  ownerAuthor: { id: string; canonicalName: string } | null;
};
type Draft = Record<string, string>;

const input = "w-full rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
export const FUEL_KEYS = ["diesel", "petrol95", "petrol98", "electric"] as const;

export const vehicleOwnerName = (v: Pick<VehicleRow, "ownerChild" | "ownerAuthor" | "ownerName">) => v.ownerChild?.name ?? v.ownerAuthor?.canonicalName ?? v.ownerName ?? "—";
export const usesTp = (v: Pick<VehicleRow, "tpConsumption1" | "tpConsumption2" | "tpConsumption3" | "tpConsumption4">) =>
  [v.tpConsumption1, v.tpConsumption2, v.tpConsumption3, v.tpConsumption4].some((x) => x !== null && Number(x) > 0);

export default function VehicleForm({
  vehicle,
  owners,
  allowFreeOwner,
  defaultOwner,
  eventId,
  onSaved,
  onCancel,
}: {
  vehicle?: VehicleRow | null;
  owners: Owner[];
  allowFreeOwner: boolean;
  defaultOwner?: { childId?: string | null; authorId?: string | null };
  eventId?: string;
  onSaved: (v: VehicleRow) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const v = vehicle;
  const [d, setD] = useState<Draft>({
    label: v?.label ?? "",
    plate: v?.plate ?? "",
    cylinderCc: v?.cylinderCc ? String(v.cylinderCc) : "",
    fuel: v?.fuel ?? "petrol95",
    gearbox: v?.gearbox ?? "manual",
    tpConsumption1: v?.tpConsumption1 ?? "",
    tpConsumption2: v?.tpConsumption2 ?? "",
    tpConsumption3: v?.tpConsumption3 ?? "",
    tpConsumption4: v?.tpConsumption4 ?? "",
    ownerChildId: v ? v.ownerChildId ?? "" : defaultOwner?.childId ?? "",
    ownerAuthorId: v ? v.ownerAuthorId ?? "" : defaultOwner?.authorId ?? "",
    ownerName: v?.ownerName ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: string) => setD({ ...d, [k]: val });
  const adults = owners.filter((o) => o.kind === "child");
  const payers = owners.filter((o) => o.kind === "author");

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(v ? `/api/vehicles/${v.id}` : "/api/vehicles", {
      method: v ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...d, ...(eventId && { eventId }) }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.bad ? t("vehicles.error.bad", { fields: j.bad.map((f: string) => t(`vehicles.field.${f.replace(/\d$/, "")}`)).join(", ") }) : res?.status === 403 ? t("vehicles.error.forbidden") : t("vehicles.error.generic"));
      return;
    }
    onSaved(await res.json());
  }

  return (
    <div className="rounded-lg border border-ember/40 bg-paper p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-[12px] text-ink-secondary sm:col-span-2">
          {t("vehicles.field.label")}
          <input className={input} value={d.label} onChange={(e) => set("label", e.target.value)} placeholder="Kia Ceed" />
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("vehicles.field.plate")}
          <input className={input} value={d.plate} onChange={(e) => set("plate", e.target.value)} />
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("vehicles.field.cylinderCc")}
          <input inputMode="numeric" className={input} value={d.cylinderCc} onChange={(e) => set("cylinderCc", e.target.value)} />
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("vehicles.field.fuel")}
          <select className={input} value={d.fuel} onChange={(e) => set("fuel", e.target.value)}>
            {FUEL_KEYS.map((f) => (
              <option key={f} value={f}>
                {t(`vehicles.fuel.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("vehicles.field.gearbox")}
          <select className={input} value={d.gearbox} onChange={(e) => set("gearbox", e.target.value)}>
            <option value="manual">{t("vehicles.gearbox.manual")}</option>
            <option value="automatic">{t("vehicles.gearbox.automatic")}</option>
          </select>
        </label>
        <div className="text-[12px] text-ink-secondary sm:col-span-2">
          {t("vehicles.field.tpConsumption")}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <input key={i} inputMode="decimal" aria-label={`${t("vehicles.field.tpConsumption")} ${i}`} className={input} value={d[`tpConsumption${i}`]} onChange={(e) => set(`tpConsumption${i}`, e.target.value)} placeholder={String(i)} />
            ))}
          </div>
          <span className="text-[11px]">{t("vehicles.tpHint")}</span>
        </div>
        <label className="text-[12px] text-ink-secondary sm:col-span-2">
          {t("vehicles.field.ownerChild")}
          <select className={input} value={d.ownerChildId} onChange={(e) => set("ownerChildId", e.target.value)}>
            <option value="">—</option>
            {adults.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-secondary sm:col-span-2">
          {t("vehicles.field.ownerAuthor")}
          <select className={input} value={d.ownerAuthorId} onChange={(e) => set("ownerAuthorId", e.target.value)}>
            <option value="">—</option>
            {payers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {allowFreeOwner && (
          <label className="text-[12px] text-ink-secondary sm:col-span-2">
            {t("vehicles.field.ownerName")}
            <input className={input} value={d.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </label>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-secondary">{t("vehicles.privacyHint")}</p>
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
          {t("common.save")}
        </button>
        <button type="button" className={btn} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
