"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import { useConfirm } from "@/components/ConfirmDialog";
import HelpLink from "@/components/HelpLink";
import VehicleForm, { vehicleOwnerName, type Owner, type VehicleRow } from "@/components/travel/VehicleForm";
import { normName, orderWarnings, type LegForm, type WorkerEntry } from "@/lib/travel-orders";
import type { CalcError, CalcResult } from "@/lib/travel-order-calc";

// Cestovní příkaz: the form of a draft (live calculation, warnings that don't block) and, once submitted, the
// read-only summary with the PDF, the payee change and Znovu otevřít.
type Form = {
  workerChildId: string | null;
  workerAuthorId: string | null;
  vehicleId: string | null;
  workerName: string;
  workerAddress: string;
  workerPhone: string;
  vehicleLabel: string;
  vehiclePlate: string;
  cylinderCc: string;
  gearbox: string;
  fuel: string;
  tpValues: string[];
  payoutMethod: "bank" | "cash";
  payoutName: string;
  payoutAccountNumber: string;
  payoutBankCode: string;
  priceFromReceipt: boolean;
  receiptPrice: string;
  receiptBillId: string;
  purpose: string;
  originPlace: string;
  destinationPlace: string;
  roundTrip: boolean;
  startAt: string;
  endAt: string;
  approvalDate: string;
  approverName: string;
  coTravellers: string;
  freeMeals: Record<string, boolean>;
  legs: LegForm[];
};
type Rate = { id: string | null; validFrom: string; note: string | null; provisional: boolean; frozen: boolean } | null;
type View = {
  order: Form & { id: string; status: "draft" | "submitted"; billId: string | null; totalAmount: string | null; submittedAt: string | null; pdfPath: string | null };
  event: { id: string; name: string; status: string };
  rate: Rate;
  calc: CalcResult | CalcError;
  bill: { id: string; status: string; paidToAuthor: boolean; payerAuthorId: string | null; payerAuthor: { canonicalName: string } | null } | null;
};
type Options = {
  event: { name: string };
  workers: WorkerEntry[];
  vehicles: VehicleRow[];
  distances: { fromPlace: string; toPlace: string; km: string }[];
  bills: { id: string; merchantName: string | null; billDate: string | null; totalAmount: string | null; originalFilename: string }[];
  payers: { id: string; canonicalName: string }[];
  admin: boolean;
};

const input = "w-full rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const cell = "w-full rounded border border-mist bg-paper-2 px-1.5 py-1 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const label = "text-[12px] text-ink-secondary";
const FREE = ["ubytovani", "snidane", "obed", "vecere"] as const;
const emptyLeg = (): LegForm => ({ date: "", fromPlace: "", toPlace: "", departTime: "", arriveTime: "", trailer: false, km: "", stravne: "", nocleh: "", vedlejsi: "" });
const czMoney = (s: string | number | null | undefined) => (s === null || s === undefined || s === "" ? "—" : `${Number(s).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`);
const czDay = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "");

function toForm(o: View["order"]): Form {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const tp = Array.isArray(o.tpValues) ? o.tpValues.map(s) : [];
  return {
    workerChildId: o.workerChildId,
    workerAuthorId: o.workerAuthorId,
    vehicleId: o.vehicleId,
    workerName: s(o.workerName),
    workerAddress: s(o.workerAddress),
    workerPhone: s(o.workerPhone),
    vehicleLabel: s(o.vehicleLabel),
    vehiclePlate: s(o.vehiclePlate),
    cylinderCc: s(o.cylinderCc),
    gearbox: s(o.gearbox),
    fuel: s(o.fuel),
    tpValues: [0, 1, 2, 3].map((i) => tp[i] ?? ""),
    payoutMethod: o.payoutMethod === "cash" ? "cash" : "bank",
    payoutName: s(o.payoutName),
    payoutAccountNumber: s(o.payoutAccountNumber),
    payoutBankCode: s(o.payoutBankCode),
    priceFromReceipt: !!o.priceFromReceipt,
    receiptPrice: s(o.receiptPrice),
    receiptBillId: s(o.receiptBillId),
    purpose: s(o.purpose),
    originPlace: s(o.originPlace),
    destinationPlace: s(o.destinationPlace),
    roundTrip: o.roundTrip !== false,
    startAt: s(o.startAt),
    endAt: s(o.endAt),
    approvalDate: s(o.approvalDate),
    approverName: s(o.approverName),
    coTravellers: s(o.coTravellers),
    freeMeals: (o.freeMeals ?? {}) as Record<string, boolean>,
    legs: o.legs.length ? o.legs.map((l) => ({ ...emptyLeg(), ...l, trailer: !!l.trailer })) : [emptyLeg()],
  };
}

export default function TravelOrderPage({ params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id: eventId, orderId } = use(params);
  const { t, lang } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [view, setView] = useState<View | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [live, setLive] = useState<{ rate: Rate; calc: CalcResult | CalcError } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [suggested, setSuggested] = useState<Set<number>>(new Set());
  const [notFound, setNotFound] = useState(false);

  const loadOpts = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/travel-orders/options`).catch(() => null);
    if (res?.ok) setOpts(await res.json());
  }, [eventId]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/travel-orders/${orderId}`).catch(() => null);
    if (!res?.ok) return setNotFound(true);
    const v: View = await res.json();
    setView(v);
    setForm(toForm(v.order));
    setLive({ rate: v.rate, calc: v.calc });
    setDirty(false);
  }, [orderId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
    loadOpts();
  }, [load, loadOpts]);

  // Live calculation of the form as typed (debounced, nothing saved).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!form || !dirty || view?.order.status !== "draft") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/travel-orders/${orderId}/calc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
      if (res?.ok) setLive(await res.json());
    }, 350);
  }, [form, dirty, orderId, view?.order.status]);

  const warnings = useMemo(() => (form ? orderWarnings(form.startAt, form.endAt, form.legs) : []), [form]);

  if (notFound) return <div className="p-8 text-[14px] text-ink-secondary">{t("travelOrders.notFound")}</div>;
  if (!view || !form) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const draft = view.order.status === "draft";

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm({ ...form, [k]: v });
    setDirty(true);
  };
  const setLeg = (i: number, patch: Partial<LegForm>) => {
    const legs = form.legs.map((l, j) => (j === i ? { ...l, ...patch } : l));
    setForm({ ...form, legs });
    setDirty(true);
  };
  // Known distance: from + to typed and km empty -> filled in (marked; the user keeps it or changes it).
  const suggest = (i: number) => {
    const l = form.legs[i];
    if (!opts || l.km || !l.fromPlace || !l.toPlace) return;
    const d = opts.distances.find((x) => normName(x.fromPlace) === normName(l.fromPlace) && normName(x.toPlace) === normName(l.toPlace));
    if (d) {
      setLeg(i, { km: String(d.km) });
      setSuggested(new Set([...suggested, i]));
    }
  };

  function pickWorker(key: string) {
    const w = opts?.workers.find((x) => x.key === key);
    if (!w || !form) return;
    setForm({
      ...form,
      workerChildId: w.childId,
      workerAuthorId: w.authorId,
      workerName: w.name,
      workerAddress: w.address ?? "",
      workerPhone: w.phone ?? "",
      payoutName: w.name,
      payoutAccountNumber: w.bankAccountNumber ?? "",
      payoutBankCode: w.bankCode ?? "",
    });
    setDirty(true);
  }
  const workerKey = opts?.workers.find((w) => (form.workerChildId && w.childId === form.workerChildId) || (!form.workerChildId && form.workerAuthorId && w.authorId === form.workerAuthorId))?.key ?? "";
  const worker = opts?.workers.find((w) => w.key === workerKey) ?? null;

  function pickVehicle(v: VehicleRow) {
    if (!form) return;
    setForm({
      ...form,
      vehicleId: v.id,
      vehicleLabel: v.label,
      vehiclePlate: v.plate ?? "",
      cylinderCc: v.cylinderCc ? String(v.cylinderCc) : "",
      fuel: v.fuel,
      gearbox: v.gearbox,
      tpValues: [v.tpConsumption1, v.tpConsumption2, v.tpConsumption3, v.tpConsumption4].map((x) => (x === null ? "" : String(x))),
    });
    setDirty(true);
  }
  const ownVehicles = (opts?.vehicles ?? []).filter((v) => (form.workerChildId && v.ownerChildId === form.workerChildId) || (form.workerAuthorId && v.ownerAuthorId === form.workerAuthorId));
  const otherVehicles = (opts?.vehicles ?? []).filter((v) => !ownVehicles.includes(v));
  const vehicleOwners: Owner[] = [
    ...(form.workerChildId ? [{ kind: "child" as const, id: form.workerChildId, name: form.workerName }] : []),
    ...(form.workerAuthorId ? [{ kind: "author" as const, id: form.workerAuthorId, name: form.workerName }] : []),
  ];

  async function save(): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/travel-orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage({ kind: "error", text: t("travelOrders.error.save") });
      return false;
    }
    const v: View = await res.json();
    setView(v);
    setLive({ rate: v.rate, calc: v.calc });
    setDirty(false);
    return true;
  }

  async function submit() {
    if (!(await save())) return;
    if (!(await confirm({ message: t("travelOrders.submitConfirm") }))) return;
    setBusy(true);
    const res = await fetch(`/api/travel-orders/${orderId}/submit`, { method: "POST" }).catch(() => null);
    setBusy(false);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) {
      const err = j?.error ?? "generic";
      setMessage({ kind: "error", text: t(`travelOrders.submitError.${err}`, { date: j?.date ? czDay(j.date) : "", legs: (j?.legs ?? []).map((n: number) => n + 1).join(", ") }) });
      return;
    }
    setMessage({ kind: "ok", text: t("travelOrders.submitted") });
    load();
  }

  async function reopen() {
    if (!(await confirm({ message: t("travelOrders.reopenConfirm") }))) return;
    const res = await fetch(`/api/travel-orders/${orderId}/reopen`, { method: "POST" }).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) return setMessage({ kind: "error", text: t(`travelOrders.reopenError.${j?.error ?? "generic"}`) });
    load();
  }

  async function remove() {
    if (!(await confirm({ message: t("travelOrders.deleteConfirm"), danger: true }))) return;
    const res = await fetch(`/api/travel-orders/${orderId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.push(`/events/${eventId}/travel-orders`);
  }

  async function changePayee(authorId: string) {
    if (!view?.bill) return;
    setBusy(true);
    const res = await fetch(`/api/bills/${view.bill.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payerAuthorId: authorId || null }) }).catch(() => null);
    setBusy(false);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) return setMessage({ kind: "error", text: j?.error === "bill_approved_locked" ? t("travelOrders.payeeApproved") : t("travelOrders.error.save") });
    setMessage({ kind: "ok", text: t("travelOrders.payeeChanged") });
    load();
  }

  async function linkSameName() {
    if (!worker?.sameNameAuthorId || !worker.childId) return;
    const res = await fetch(`/api/authors/${worker.sameNameAuthorId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId: worker.childId }) }).catch(() => null);
    if (res?.ok) loadOpts();
  }

  const calc = live?.calc;
  const rate = live?.rate;
  const calcErrorText = (c: CalcError) =>
    c.errors.map((e) => (e.startsWith("leg_km:") ? t("travelOrders.calcError.leg_km", { n: String(Number(e.split(":")[1]) + 1) }) : e.startsWith("leg_amount:") ? t("travelOrders.calcError.leg_amount", { n: String(Number(e.split(":")[1]) + 1) }) : t(`travelOrders.calcError.${e}`))).join(" ");
  const missing = (v: string) => draft && !v.trim() && <span className="ml-1 text-[11px] text-amber-800">{t("travelOrders.missing")}</span>;
  const disabled = !draft;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <a href={`/events/${eventId}/travel-orders`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("travelOrders.title")}
      </a>
      <div className="mb-1 mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] font-semibold text-ink">
          {t("travelOrders.orderTitle")}
          {form.workerName ? `: ${form.workerName}` : ""}
        </h1>
        <span className={"rounded-full px-2 py-0.5 text-[12px] " + (draft ? "bg-paper-2 text-ink-secondary" : "bg-pine-bg text-pine")}>{t(`travelOrders.statusValue.${view.order.status}`)}</span>
        <HelpLink slug="cestovni-prikazy" />
      </div>
      <p className="mb-4 text-[12px] text-ink-secondary">{t("travelOrders.privacy")}</p>
      {message && <div className={"mb-3 rounded-lg px-3 py-2 text-[13px] " + (message.kind === "error" ? "border border-red-300 bg-red-50 text-red-800" : "border border-pine/40 bg-pine-bg text-pine")}>{message.text}</div>}

      {!draft && view.bill && (
        <section className="mb-4 rounded-lg border border-mist bg-paper p-4">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <a href={`/events/${eventId}/bills/${view.bill.id}`} className="text-ember hover:underline">
              {t("travelOrders.openBill")}
            </a>
            <a href={`/api/bills/${view.bill.id}/file`} target="_blank" rel="noreferrer" className="text-ember hover:underline">
              {t("travelOrders.openPdf")}
            </a>
            <label className="flex items-center gap-2">
              {t("travelOrders.payee")}
              <select className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px]" value={view.bill.payerAuthorId ?? ""} disabled={busy || view.bill.status === "approved"} onChange={(e) => changePayee(e.target.value)}>
                {(opts?.payers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.canonicalName}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex-1" />
            <button type="button" className={btn} onClick={reopen}>
              {t("travelOrders.reopen")}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-secondary">{t("travelOrders.payeeHint")}</p>
          <iframe src={`/api/bills/${view.bill.id}/file`} title={t("travelOrders.openPdf")} className="mt-3 h-[70vh] w-full rounded border border-mist bg-white" />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Pracovník */}
          <section className="rounded-lg border border-mist bg-paper p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("travelOrders.workerTitle")}</h2>
            {draft && (
              <label className={label}>
                {t("travelOrders.pickWorker")}
                <select className={input} value={workerKey} onChange={(e) => pickWorker(e.target.value)}>
                  <option value="">—</option>
                  {(opts?.workers ?? []).map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.name}
                      {w.childId && w.authorId ? ` · ${t("travelOrders.adultAndPayer")}` : w.childId ? ` · ${t("travelOrders.adult")}` : ` · ${t("travelOrders.payerOnly")}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft && worker?.sameNameAuthorId && (
              <p className="mt-1 text-[12px] text-amber-800">
                {t("travelOrders.sameName")}{" "}
                {opts?.admin && (
                  <button type="button" className="text-ember hover:underline" onClick={linkSameName}>
                    {t("payerLink.link")}
                  </button>
                )}
              </p>
            )}
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={label}>
                {t("travelOrders.workerName")}
                {missing(form.workerName)}
                <input className={input} disabled={disabled} value={form.workerName} onChange={(e) => set("workerName", e.target.value)} />
              </label>
              <label className={label + " sm:col-span-2"}>
                {t("travelOrders.workerAddress")}
                {missing(form.workerAddress)}
                <input className={input} disabled={disabled} value={form.workerAddress} onChange={(e) => set("workerAddress", e.target.value)} />
              </label>
              <label className={label}>
                {t("travelOrders.workerPhone")}
                {missing(form.workerPhone)}
                <input className={input} disabled={disabled} value={form.workerPhone} onChange={(e) => set("workerPhone", e.target.value)} />
              </label>
            </div>
          </section>

          {/* Vozidlo */}
          <section className="rounded-lg border border-mist bg-paper p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("travelOrders.vehicleTitle")}</h2>
            {draft && (
              <div className="flex flex-wrap items-end gap-2">
                <label className={label + " min-w-[16rem] flex-1"}>
                  {t("travelOrders.pickVehicle")}
                  <select
                    className={input}
                    value={form.vehicleId ?? ""}
                    onChange={(e) => {
                      const v = opts?.vehicles.find((x) => x.id === e.target.value);
                      if (v) pickVehicle(v);
                    }}
                  >
                    <option value="">—</option>
                    {ownVehicles.length > 0 && (
                      <optgroup label={t("travelOrders.ownVehicles")}>
                        {ownVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label} {v.plate ? `· ${v.plate}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherVehicles.length > 0 && (
                      <optgroup label={t("travelOrders.otherVehicles")}>
                        {otherVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label} {v.plate ? `· ${v.plate}` : ""} ({vehicleOwnerName(v)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <button type="button" className={btn} disabled={!vehicleOwners.length} title={vehicleOwners.length ? undefined : t("travelOrders.pickWorkerFirst")} onClick={() => setAddingVehicle(true)}>
                  + {t("vehicles.add")}
                </button>
              </div>
            )}
            {addingVehicle && (
              <div className="mt-3">
                <VehicleForm
                  owners={vehicleOwners}
                  allowFreeOwner={false}
                  defaultOwner={{ childId: form.workerChildId, authorId: form.workerChildId ? null : form.workerAuthorId }}
                  eventId={eventId}
                  onCancel={() => setAddingVehicle(false)}
                  onSaved={(v) => {
                    setAddingVehicle(false);
                    loadOpts();
                    pickVehicle(v);
                  }}
                />
              </div>
            )}
            {form.vehicleLabel ? (
              <p className="mt-2 text-[13px] text-ink">
                {form.vehicleLabel}
                {form.vehiclePlate && ` · ${t("vehicles.field.plate")} ${form.vehiclePlate}`}
                {form.cylinderCc && ` · ${form.cylinderCc} cm³`}
                {form.fuel && ` · ${t(`vehicles.fuel.${form.fuel}`)}`}
                {form.gearbox && ` · ${t(`vehicles.gearbox.${form.gearbox}`)}`}
                {form.tpValues.some((x) => Number(x) > 0) && ` · TP ${form.tpValues.filter((x) => Number(x) > 0).join(" / ")}`}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-amber-800">{t("travelOrders.noVehicle")}</p>
            )}
          </section>

          {/* Cesta */}
          <section className="rounded-lg border border-mist bg-paper p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("travelOrders.tripTitle")}</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={label + " sm:col-span-4"}>
                {t("travelOrders.purpose")}
                <input className={input} disabled={disabled} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
              </label>
              <label className={label + " sm:col-span-2"}>
                {t("travelOrders.origin")}
                <input className={input} disabled={disabled} value={form.originPlace} onChange={(e) => set("originPlace", e.target.value)} />
              </label>
              <label className={label + " sm:col-span-2"}>
                {t("travelOrders.destination")}
                <input className={input} disabled={disabled} value={form.destinationPlace} onChange={(e) => set("destinationPlace", e.target.value)} />
              </label>
              <label className={label}>
                {t("travelOrders.startAt")}
                <input type="datetime-local" className={input} disabled={disabled} value={form.startAt} onChange={(e) => set("startAt", e.target.value)} />
              </label>
              <label className={label}>
                {t("travelOrders.endAt")}
                <input type="datetime-local" className={input} disabled={disabled} value={form.endAt} onChange={(e) => set("endAt", e.target.value)} />
              </label>
              <label className="flex items-end gap-2 pb-1.5 text-[13px] text-ink">
                <input type="checkbox" disabled={disabled} checked={form.roundTrip} onChange={(e) => set("roundTrip", e.target.checked)} />
                {t("travelOrders.roundTrip")}
              </label>
              <span />
              <label className={label}>
                {t("travelOrders.approvalDate")}
                <input type="date" className={input} disabled={disabled} value={form.approvalDate} onChange={(e) => set("approvalDate", e.target.value)} />
              </label>
              <label className={label}>
                {t("travelOrders.approverName")}
                <input className={input} disabled={disabled} value={form.approverName} onChange={(e) => set("approverName", e.target.value)} />
              </label>
              <label className={label + " sm:col-span-2"}>
                {t("travelOrders.coTravellers")}
                <input className={input} disabled={disabled} value={form.coTravellers} onChange={(e) => set("coTravellers", e.target.value)} />
              </label>
              <div className="text-[13px] text-ink sm:col-span-4">
                <span className={label}>{t("travelOrders.freeMeals")}</span>
                <div className="flex flex-wrap gap-4">
                  {FREE.map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" disabled={disabled} checked={!!form.freeMeals[k]} onChange={(e) => set("freeMeals", { ...form.freeMeals, [k]: e.target.checked })} />
                      {t(`travelOrders.free.${k}`)}
                    </label>
                  ))}
                </div>
                <span className="text-[11px] text-ink-secondary">{t("travelOrders.freeMealsHint")}</span>
              </div>
            </div>
          </section>

          {/* Úseky */}
          <section className="rounded-lg border border-mist bg-paper p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">
              {t("travelOrders.legsTitle")} <span className="text-[12px] font-normal text-ink-secondary">({t(`travelOrders.legCount.${pluralForm(form.legs.filter((l) => l.km).length, lang)}`, { count: String(form.legs.filter((l) => l.km).length) })})</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-[12px]">
                <thead className="text-left text-ink-secondary">
                  <tr>
                    <th className="p-1">#</th>
                    <th className="p-1">{t("travelOrders.leg.date")}</th>
                    <th className="p-1">{t("travelOrders.leg.from")}</th>
                    <th className="p-1">{t("travelOrders.leg.to")}</th>
                    <th className="p-1">{t("travelOrders.leg.depart")}</th>
                    <th className="p-1">{t("travelOrders.leg.arrive")}</th>
                    <th className="p-1">{t("travelOrders.leg.trailer")}</th>
                    <th className="p-1">km</th>
                    <th className="p-1">{t("travelOrders.leg.stravne")}</th>
                    <th className="p-1">{t("travelOrders.leg.nocleh")}</th>
                    <th className="p-1">{t("travelOrders.leg.vedlejsi")}</th>
                    <th className="p-1 text-right">{t("travelOrders.leg.amount")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.legs.map((l, i) => {
                    const c = calc?.ok ? calc.legs.find((x) => x.index === i) : null;
                    const w = warnings.filter((x) => x.leg === i);
                    return (
                      <tr key={i} className={"border-t border-mist align-top " + (w.length ? "bg-amber-50/60" : "")}>
                        <td className="p-1 pt-2 text-ink-secondary">{i + 1}</td>
                        <td className="p-1">
                          <input type="date" aria-label={`${t("travelOrders.leg.date")} ${i + 1}`} className={cell} disabled={disabled} value={l.date} onChange={(e) => setLeg(i, { date: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`${t("travelOrders.leg.from")} ${i + 1}`} className={cell} disabled={disabled} value={l.fromPlace} onChange={(e) => setLeg(i, { fromPlace: e.target.value })} onBlur={() => suggest(i)} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`${t("travelOrders.leg.to")} ${i + 1}`} className={cell} disabled={disabled} value={l.toPlace} onChange={(e) => setLeg(i, { toPlace: e.target.value })} onBlur={() => suggest(i)} />
                        </td>
                        <td className="p-1">
                          <input type="time" aria-label={`${t("travelOrders.leg.depart")} ${i + 1}`} className={cell} disabled={disabled} value={l.departTime} onChange={(e) => setLeg(i, { departTime: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input type="time" aria-label={`${t("travelOrders.leg.arrive")} ${i + 1}`} className={cell} disabled={disabled} value={l.arriveTime} onChange={(e) => setLeg(i, { arriveTime: e.target.value })} />
                        </td>
                        <td className="p-1 pt-2 text-center">
                          <input type="checkbox" aria-label={`${t("travelOrders.leg.trailer")} ${i + 1}`} disabled={disabled} checked={l.trailer} onChange={(e) => setLeg(i, { trailer: e.target.checked })} />
                        </td>
                        <td className="w-20 p-1">
                          <input
                            inputMode="decimal"
                            aria-label={`km ${i + 1}`}
                            className={cell + (suggested.has(i) ? " ring-1 ring-pine" : "")}
                            disabled={disabled}
                            value={l.km}
                            onChange={(e) => {
                              setLeg(i, { km: e.target.value });
                              setSuggested(new Set([...suggested].filter((x) => x !== i)));
                            }}
                          />
                          {suggested.has(i) && <div className="text-[10px] text-pine">{t("travelOrders.kmSuggested")}</div>}
                        </td>
                        {(["stravne", "nocleh", "vedlejsi"] as const).map((k) => (
                          <td key={k} className="w-20 p-1">
                            <input inputMode="decimal" aria-label={`${t(`travelOrders.leg.${k}`)} ${i + 1}`} className={cell} disabled={disabled} value={l[k]} onChange={(e) => setLeg(i, { [k]: e.target.value })} />
                          </td>
                        ))}
                        <td className="whitespace-nowrap p-1 pt-2 text-right tabular-nums">{c ? czMoney(c.total) : ""}</td>
                        <td className="p-1 pt-1.5">
                          {draft && form.legs.length > 1 && (
                            <button type="button" className="text-ink-secondary hover:text-red-700" aria-label={t("travelOrders.leg.remove")} onClick={() => set("legs", form.legs.filter((_, j) => j !== i))}>
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {draft && (
              <button
                type="button"
                className={btn + " mt-2"}
                onClick={() => {
                  const last = form.legs[form.legs.length - 1];
                  set("legs", [...form.legs, { ...emptyLeg(), date: last?.date ?? "", fromPlace: last?.toPlace ?? "" }]);
                }}
              >
                + {t("travelOrders.leg.add")}
              </button>
            )}
            {warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[12px] text-amber-800">
                {warnings.map((w, j) => (
                  <li key={j}>{t(`travelOrders.warning.${w.code}`, { n: String(w.leg + 1) })}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Palivo a výplata */}
          <section className="rounded-lg border border-mist bg-paper p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("travelOrders.fuelTitle")}</h2>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" disabled={disabled} checked={form.priceFromReceipt} onChange={(e) => set("priceFromReceipt", e.target.checked)} />
              {t("travelOrders.useReceipt")}
            </label>
            {form.priceFromReceipt && (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <label className={label}>
                  {t("travelOrders.receiptPrice")}
                  <input inputMode="decimal" className={input} disabled={disabled} value={form.receiptPrice} onChange={(e) => set("receiptPrice", e.target.value)} />
                </label>
                <label className={label + " sm:col-span-2"}>
                  {t("travelOrders.receiptBill")}
                  <select className={input} disabled={disabled} value={form.receiptBillId} onChange={(e) => set("receiptBillId", e.target.value)}>
                    <option value="">—</option>
                    {(opts?.bills ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {[b.billDate && czDay(b.billDate), b.merchantName ?? b.originalFilename, b.totalAmount && czMoney(b.totalAmount)].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink">{t("travelOrders.payoutTitle")}</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={label}>
                {t("travelOrders.payoutMethod")}
                <select className={input} disabled={disabled} value={form.payoutMethod} onChange={(e) => set("payoutMethod", e.target.value as Form["payoutMethod"])}>
                  <option value="bank">{t("travelOrders.payoutBank")}</option>
                  <option value="cash">{t("travelOrders.payoutCash")}</option>
                </select>
              </label>
              {form.payoutMethod === "bank" && (
                <>
                  <label className={label + " sm:col-span-2"}>
                    {t("travelOrders.account")}
                    {missing(form.payoutAccountNumber)}
                    <input className={input} disabled={disabled} value={form.payoutAccountNumber} onChange={(e) => set("payoutAccountNumber", e.target.value)} placeholder="123456789" />
                  </label>
                  <label className={label}>
                    {t("travelOrders.bankCode")}
                    {missing(form.payoutBankCode)}
                    <input className={input} disabled={disabled} value={form.payoutBankCode} onChange={(e) => set("payoutBankCode", e.target.value)} placeholder="0800" />
                  </label>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ink-secondary">{t("travelOrders.payoutHint", { name: view.bill?.payerAuthor?.canonicalName ?? form.payoutName ?? form.workerName })}</p>
          </section>
        </div>

        {/* Live calculation */}
        <aside className="h-fit rounded-lg border border-mist bg-paper p-4 lg:sticky lg:top-4">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("travelOrders.calcTitle")}</h2>
          {rate ? (
            <p className="text-[12px] text-ink-secondary">
              {t("travelOrders.rateFrom", { date: czDay(rate.validFrom) })}
              {rate.provisional && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-800">{t("travelOrders.provisional")}</span>}
              {rate.frozen && <span className="ml-1 rounded bg-paper-2 px-1 text-[11px]">{t("travelOrders.frozen")}</span>}
            </p>
          ) : (
            <p className="text-[12px] text-red-700">{t("travelOrders.noRates")}</p>
          )}
          {rate?.provisional && <p className="mt-1 text-[12px] text-amber-800">{t("travelOrders.provisionalHint")}</p>}
          {calc && !calc.ok && <p className="mt-2 text-[12px] text-amber-800">{calcErrorText(calc)}</p>}
          {calc?.ok && (
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-ink-secondary">{t("travelOrders.consumption")}</dt>
              <dd className="text-right tabular-nums">
                {Number(calc.consumption).toLocaleString("cs-CZ")} ({t(`vehicles.${calc.consumptionSource === "tp" ? "fromTp" : "fromTable"}`)})
              </dd>
              <dt className="text-ink-secondary">{t("travelOrders.pricePerUnit")}</dt>
              <dd className="text-right tabular-nums">{czMoney(calc.price)}</dd>
              <dt className="text-ink-secondary">{t("travelOrders.pricePerKm")}</dt>
              <dd className="text-right tabular-nums">{Number(calc.fuelPerKm).toLocaleString("cs-CZ", { maximumFractionDigits: 4 })} Kč</dd>
              <dt className="text-ink-secondary">{t("travelOrders.totalKm")}</dt>
              <dd className="text-right tabular-nums">{Number(calc.totalKm).toLocaleString("cs-CZ")} km</dd>
              <dt className="text-ink-secondary">{t("travelOrders.fuelCost")}</dt>
              <dd className="text-right tabular-nums">{czMoney(calc.fuelCost)}</dd>
              <dt className="text-ink-secondary">{t("travelOrders.kmRate")}</dt>
              <dd className="text-right tabular-nums">{czMoney(calc.kmRateAmount)}</dd>
              <dt className="text-ink-secondary">{t("travelOrders.legsSum")}</dt>
              <dd className="text-right tabular-nums">{czMoney(calc.legsSum)}</dd>
              <dt className="font-semibold text-ink">{t("travelOrders.total")}</dt>
              <dd className="text-right text-[15px] font-semibold tabular-nums text-ink">{czMoney(calc.total)}</dd>
            </dl>
          )}
          {draft && (
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={btn} disabled={busy || !dirty} onClick={save}>
                {dirty ? t("travelOrders.saveDraft") : t("travelOrders.saved")}
              </button>
              <button type="button" className={btnPrimary} disabled={busy || view.event.status === "closed"} onClick={submit}>
                {t("travelOrders.submit")}
              </button>
              {!view.order.billId && (
                <button type="button" className="text-[12px] text-red-700 hover:underline" onClick={remove}>
                  {t("travelOrders.deleteDraft")}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
