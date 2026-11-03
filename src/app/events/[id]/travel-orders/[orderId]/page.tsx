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
import { DateField, DateTimeField, TimeField } from "@/components/DateTimeFields";

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
  rateSetId: string;
};
type Rate = { id: string | null; validFrom: string; note: string | null; provisional: boolean; frozen: boolean; chosen?: boolean } | null;
type View = {
  order: Omit<Form, "rateSetId"> & { id: string; status: "draft" | "submitted"; billId: string | null; totalAmount: string | null; submittedAt: string | null; pdfPath: string | null; rateSetId: string | null };
  event: { id: string; name: string; status: string };
  rate: Rate;
  calc: CalcResult | CalcError;
  bill: { id: string; status: string; paidToAuthor: boolean; payerAuthorId: string | null; payerAuthor: { canonicalName: string } | null } | null;
};
type Template = { id: string; name: string; createdByUserId: string | null; data: { purpose: string | null; originPlace: string | null; destinationPlace: string | null; roundTrip: boolean; legs: (Omit<LegForm, "date"> & { dayOffset: number })[] } };
type Options = {
  event: { name: string };
  workers: WorkerEntry[];
  vehicles: VehicleRow[];
  distances: { fromPlace: string; toPlace: string; km: string }[];
  bills: { id: string; merchantName: string | null; billDate: string | null; totalAmount: string | null; originalFilename: string }[];
  payers: { id: string; canonicalName: string }[];
  places: { id: string; name: string }[];
  rateSets: { id: string; validFrom: string; note: string | null }[];
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
    rateSetId: o.rateSetId ?? "",
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
  // Legs whose km was filled in automatically: "known" (earlier orders), "map" (estimate), "form" (same route above).
  const [suggested, setSuggested] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [newPlace, setNewPlace] = useState("");
  const [placeFor, setPlaceFor] = useState<{ leg: number; field: "fromPlace" | "toPlace" } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState("");
  const [tplName, setTplName] = useState<string | null>(null);

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
  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/travel-templates").catch(() => null);
    if (res?.ok) setTemplates(await res.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
    loadOpts();
    loadTemplates();
  }, [load, loadOpts, loadTemplates]);

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
    setForm((f) => (f ? { ...f, legs: f.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));
    setDirty(true);
  };
  const samePair = (a: LegForm, from: string, to: string) =>
    (normName(a.fromPlace) === normName(from) && normName(a.toPlace) === normName(to)) || (normName(a.fromPlace) === normName(to) && normName(a.toPlace) === normName(from));
  // A route between two places: the same route elsewhere in this order, else earlier orders / the map (server).
  // Fills km when it's empty or was filled automatically; marked, so the user sees it and can change it.
  const lookupKm = async (i: number, from: string, to: string, legs: LegForm[]) => {
    if (!from || !to || normName(from) === normName(to)) return;
    if (legs[i]?.km && !suggested[i]) return;
    const inForm = legs.find((l, j) => j !== i && l.km && samePair(l, from, to));
    if (inForm) {
      setLeg(i, { km: inForm.km });
      setSuggested((s) => ({ ...s, [i]: "form" }));
      return;
    }
    setSuggested((s) => ({ ...s, [i]: "searching" }));
    const res = await fetch(`/api/events/${eventId}/travel-orders/distance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).catch(() => null);
    const j = res?.ok ? await res.json() : null;
    setForm((f) => {
      const l = f?.legs[i];
      if (!f || !l || normName(l.fromPlace) !== normName(from) || normName(l.toPlace) !== normName(to)) return f;
      return j?.km ? { ...f, legs: f.legs.map((x, k) => (k === i ? { ...x, km: String(j.km) } : x)) } : f;
    });
    setSuggested((s) => {
      const n = { ...s };
      if (j?.km) n[i] = j.source === "known" ? "known" : `map:${j.routes}:${j.fromLabel} → ${j.toLabel}`;
      else delete n[i];
      return n;
    });
  };
  const setPlace = (i: number, field: "fromPlace" | "toPlace", v: string) => {
    const legs = form.legs.map((l, j) => (j === i ? { ...l, [field]: v } : l));
    setLeg(i, { [field]: v });
    lookupKm(i, legs[i].fromPlace, legs[i].toPlace, legs);
  };
  async function addPlace(name: string) {
    const n = name.trim();
    if (!n) return null;
    const res = await fetch(`/api/events/${eventId}/travel-places`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }).catch(() => null);
    if (res?.ok) {
      const places = await res.json();
      setOpts((o) => (o ? { ...o, places } : o));
    }
    return n.replace(/\s+/g, " ");
  }
  async function removePlace(name: string) {
    const res = await fetch(`/api/events/${eventId}/travel-places`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    if (res?.ok) {
      const places = await res.json();
      setOpts((o) => (o ? { ...o, places } : o));
    }
  }
  // Šablony cest: the trip and its legs (dates from this order's start + each leg's day offset); places join the
  // event's list. Worker, car and payout stay as they are.
  async function applyTemplate() {
    const tpl = templates.find((x) => x.id === tplId);
    if (!tpl || !form) return;
    if (form.legs.some((l) => l.km || l.fromPlace) && !(await confirm({ message: t("travelOrders.tplReplace", { name: tpl.name }) }))) return;
    const start = (form.startAt || new Date().toISOString()).slice(0, 10);
    const day = (off: number) => new Date(Date.parse(`${start}T00:00:00Z`) + off * 86400000).toISOString().slice(0, 10);
    const d = tpl.data;
    setForm({
      ...form,
      purpose: d.purpose || form.purpose,
      originPlace: d.originPlace ?? form.originPlace,
      destinationPlace: d.destinationPlace ?? form.destinationPlace,
      roundTrip: d.roundTrip,
      legs: d.legs.length ? d.legs.map(({ dayOffset, ...l }) => ({ ...emptyLeg(), ...l, date: day(dayOffset) })) : form.legs,
    });
    setDirty(true);
    setSuggested({});
    setPicked(new Set());
    const known = new Set((opts?.places ?? []).map((p) => normName(p.name)));
    for (const n of new Set(d.legs.flatMap((l) => [l.fromPlace, l.toPlace]).filter(Boolean))) if (!known.has(normName(n))) await addPlace(n);
  }
  async function saveTemplate() {
    const name = (tplName ?? "").trim();
    if (!name || !form) return;
    if (templates.some((x) => x.name === name) && !(await confirm({ message: t("travelOrders.tplOverwrite", { name }) }))) return;
    const res = await fetch("/api/travel-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, eventId, name }) }).catch(() => null);
    setMessage(res?.ok ? { kind: "ok", text: t("travelOrders.tplSaved", { name }) } : { kind: "error", text: t("travelOrders.error.save") });
    setTplName(null);
    loadTemplates();
  }
  async function deleteTemplate() {
    const tpl = templates.find((x) => x.id === tplId);
    if (!tpl || !(await confirm({ message: t("travelOrders.tplDeleteConfirm", { name: tpl.name }), danger: true }))) return;
    const res = await fetch(`/api/travel-templates/${tpl.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setMessage({ kind: "error", text: t("travelOrders.tplDeleteForbidden") });
    setTplId("");
    loadTemplates();
  }
  async function copyForAnother() {
    const res = await fetch(`/api/travel-orders/${orderId}/copy`, { method: "POST" }).catch(() => null);
    if (res?.ok) router.push(`/events/${eventId}/travel-orders/${(await res.json()).id}`);
  }

  // Duplicate the ticked legs after the last one; their dates move past the block (a route every day).
  function duplicatePicked() {
    if (!form) return;
    const rows = [...picked].sort((a, b) => a - b).map((i) => form.legs[i]);
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    const shift = dates.length ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000) + 1 : 0;
    const move = (d: string) => (d && shift ? new Date(Date.parse(`${d}T00:00:00Z`) + shift * 86400000).toISOString().slice(0, 10) : d);
    set("legs", [...form.legs, ...rows.map((r) => ({ ...r, date: move(r.date) }))]);
    setPicked(new Set());
  }

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
    <div className="mx-auto max-w-[110rem] p-4 md:p-8">
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
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper p-3 text-[13px]">
        <span className="font-medium text-ink">{t("travelOrders.templates")}</span>
        {draft && (
          <>
            <select className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px]" value={tplId} onChange={(e) => setTplId(e.target.value)} aria-label={t("travelOrders.templates")}>
              <option value="">{templates.length ? t("travelOrders.tplPick") : t("travelOrders.tplNone")}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.data.legs.length})
                </option>
              ))}
            </select>
            <button type="button" className={btn} disabled={!tplId} onClick={applyTemplate}>
              {t("travelOrders.tplApply")}
            </button>
            {tplId && (
              <button type="button" className="text-[12px] text-red-700 hover:underline" onClick={deleteTemplate}>
                {t("travelOrders.tplDelete")}
              </button>
            )}
          </>
        )}
        <span className="flex-1" />
        {tplName === null ? (
          <button type="button" className={btn} onClick={() => setTplName(form.purpose || "")}>
            {t("travelOrders.tplSave")}
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <input autoFocus className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px]" value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTemplate()} placeholder={t("travelOrders.tplName")} aria-label={t("travelOrders.tplName")} />
            <button type="button" className={btn} disabled={!tplName.trim()} onClick={saveTemplate}>
              {t("common.save")}
            </button>
            <button type="button" className="text-[12px] text-ink-secondary hover:underline" onClick={() => setTplName(null)}>
              {t("common.cancel")}
            </button>
          </span>
        )}
        <button type="button" className={btn} onClick={copyForAnother}>
          {t("travelOrders.copyForAnother")}
        </button>
      </div>
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
                <DateTimeField className={input} disabled={disabled} value={form.startAt} onChange={(v) => set("startAt", v)} ariaLabel={t("travelOrders.startAt")} />
              </label>
              <label className={label}>
                {t("travelOrders.endAt")}
                <DateTimeField className={input} disabled={disabled} value={form.endAt} onChange={(v) => set("endAt", v)} ariaLabel={t("travelOrders.endAt")} />
              </label>
              <label className="flex items-end gap-2 pb-1.5 text-[13px] text-ink">
                <input type="checkbox" disabled={disabled} checked={form.roundTrip} onChange={(e) => set("roundTrip", e.target.checked)} />
                {t("travelOrders.roundTrip")}
              </label>
              <span />
              <label className={label}>
                {t("travelOrders.approvalDate")}
                <DateField className={input} disabled={disabled} value={form.approvalDate} onChange={(v) => set("approvalDate", v)} ariaLabel={t("travelOrders.approvalDate")} />
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
          {draft && (
            <label className={label + " mb-2 block"}>
              {t("travelOrders.rateSet")}
              <select className={input} value={form.rateSetId} onChange={(e) => set("rateSetId", e.target.value)}>
                <option value="">{t("travelOrders.rateAuto")}</option>
                {(opts?.rateSets ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {t("travelOrders.rateFrom", { date: czDay(r.validFrom) })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {rate ? (
            <p className="text-[12px] text-ink-secondary">
              {t("travelOrders.rateFrom", { date: czDay(rate.validFrom) })}
              {rate.provisional && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-800">{t("travelOrders.provisional")}</span>}
              {rate.frozen && <span className="ml-1 rounded bg-paper-2 px-1 text-[11px]">{t("travelOrders.frozen")}</span>}
              {rate.chosen && <span className="ml-1 rounded bg-paper-2 px-1 text-[11px]">{t("travelOrders.rateChosen")}</span>}
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
      {/* Úseky: the full width (the table needs it) */}
      <section className="mt-4 rounded-lg border border-mist bg-paper p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">
          {t("travelOrders.legsTitle")} <span className="text-[12px] font-normal text-ink-secondary">({t(`travelOrders.legCount.${pluralForm(form.legs.filter((l) => l.km).length, lang)}`, { count: String(form.legs.filter((l) => l.km).length) })})</span>
        </h2>
        {/* Místa akce: one list for every order of the event, offered in Odkud / Kam */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink-secondary">{t("travelOrders.places")}:</span>
          {(opts?.places ?? []).map((pl) => (
            <span key={pl.id} className="flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-ink">
              {pl.name}
              {draft && (
                <button type="button" className="text-ink-secondary hover:text-red-700" aria-label={t("travelOrders.placeRemove", { name: pl.name })} onClick={() => removePlace(pl.name)}>
                  ×
                </button>
              )}
            </span>
          ))}
          {draft && (
            <form
              className="flex items-center gap-1"
              onSubmit={async (e) => {
                e.preventDefault();
                await addPlace(newPlace);
                setNewPlace("");
              }}
            >
              <input className="rounded border border-mist bg-paper-2 px-2 py-0.5 text-[12px]" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} placeholder={t("travelOrders.placeAdd")} aria-label={t("travelOrders.placeAdd")} />
              <button type="submit" className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2" disabled={!newPlace.trim()}>
                +
              </button>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] text-[12px]">
            <thead className="text-left text-ink-secondary">
              <tr>
                <th className="w-6 p-1">
                  {draft && (
                    <input
                      type="checkbox"
                      aria-label={t("travelOrders.leg.pickAll")}
                      checked={picked.size > 0 && picked.size === form.legs.length}
                      onChange={(e) => setPicked(e.target.checked ? new Set(form.legs.map((_, i) => i)) : new Set())}
                    />
                  )}
                </th>
                <th className="w-6 p-1">#</th>
                <th className="w-32 p-1">{t("travelOrders.leg.date")}</th>
                <th className="p-1">{t("travelOrders.leg.from")}</th>
                <th className="p-1">{t("travelOrders.leg.to")}</th>
                <th className="w-20 p-1">{t("travelOrders.leg.depart")}</th>
                <th className="w-20 p-1">{t("travelOrders.leg.arrive")}</th>
                <th className="w-12 p-1">{t("travelOrders.leg.trailer")}</th>
                <th className="w-24 p-1">km</th>
                <th className="w-20 p-1">{t("travelOrders.leg.stravne")}</th>
                <th className="w-20 p-1">{t("travelOrders.leg.nocleh")}</th>
                <th className="w-20 p-1">{t("travelOrders.leg.vedlejsi")}</th>
                <th className="w-24 p-1 text-right">{t("travelOrders.leg.amount")}</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {form.legs.map((l, i) => {
                const c = calc?.ok ? calc.legs.find((x) => x.index === i) : null;
                const w = warnings.filter((x) => x.leg === i);
                const sug = suggested[i];
                const placeCell = (field: "fromPlace" | "toPlace") => {
                  const names = [...new Set([...(opts?.places ?? []).map((p) => p.name), ...(l[field] ? [l[field]] : [])])].sort((a, b) => a.localeCompare(b, "cs"));
                  if (placeFor?.leg === i && placeFor.field === field)
                    return (
                      <input
                        autoFocus
                        className={cell}
                        placeholder={t("travelOrders.placeNew")}
                        aria-label={t("travelOrders.placeNew")}
                        onBlur={() => setPlaceFor(null)}
                        onKeyDown={async (e) => {
                          if (e.key === "Escape") setPlaceFor(null);
                          if (e.key === "Enter") {
                            const name = await addPlace((e.target as HTMLInputElement).value);
                            setPlaceFor(null);
                            if (name) setPlace(i, field, name);
                          }
                        }}
                      />
                    );
                  return (
                    <select
                      aria-label={`${t(field === "fromPlace" ? "travelOrders.leg.from" : "travelOrders.leg.to")} ${i + 1}`}
                      className={cell}
                      disabled={disabled}
                      value={l[field]}
                      onChange={(e) => (e.target.value === "__new" ? setPlaceFor({ leg: i, field }) : setPlace(i, field, e.target.value))}
                    >
                      <option value="">—</option>
                      {names.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      <option value="__new">＋ {t("travelOrders.placeNew")}</option>
                    </select>
                  );
                };
                return (
                  <tr key={i} className={"border-t border-mist align-top " + (w.length ? "bg-amber-50/60" : picked.has(i) ? "bg-paper-2" : "")}>
                    <td className="p-1 pt-2">
                      {draft && (
                        <input
                          type="checkbox"
                          aria-label={`${t("travelOrders.leg.pick")} ${i + 1}`}
                          checked={picked.has(i)}
                          onChange={(e) => {
                            const n = new Set(picked);
                            if (e.target.checked) n.add(i);
                            else n.delete(i);
                            setPicked(n);
                          }}
                        />
                      )}
                    </td>
                    <td className="p-1 pt-2 text-ink-secondary">{i + 1}</td>
                    <td className="p-1">
                      <DateField ariaLabel={`${t("travelOrders.leg.date")} ${i + 1}`} className={cell} disabled={disabled} value={l.date} onChange={(v) => setLeg(i, { date: v })} />
                    </td>
                    <td className="min-w-[12rem] p-1">{placeCell("fromPlace")}</td>
                    <td className="min-w-[12rem] p-1">{placeCell("toPlace")}</td>
                    <td className="p-1">
                      <TimeField ariaLabel={`${t("travelOrders.leg.depart")} ${i + 1}`} className={cell} disabled={disabled} value={l.departTime} onChange={(v) => setLeg(i, { departTime: v })} />
                    </td>
                    <td className="p-1">
                      <TimeField ariaLabel={`${t("travelOrders.leg.arrive")} ${i + 1}`} className={cell} disabled={disabled} value={l.arriveTime} onChange={(v) => setLeg(i, { arriveTime: v })} />
                    </td>
                    <td className="p-1 pt-2 text-center">
                      <input type="checkbox" aria-label={`${t("travelOrders.leg.trailer")} ${i + 1}`} disabled={disabled} checked={l.trailer} onChange={(e) => setLeg(i, { trailer: e.target.checked })} />
                    </td>
                    <td className="p-1">
                      <input
                        inputMode="decimal"
                        aria-label={`km ${i + 1}`}
                        className={cell + (sug && sug !== "searching" ? " ring-1 ring-pine" : "")}
                        disabled={disabled}
                        value={l.km}
                        onChange={(e) => {
                          setLeg(i, { km: e.target.value });
                          setSuggested((s) => {
                            const n = { ...s };
                            delete n[i];
                            return n;
                          });
                        }}
                      />
                      {sug && (
                        <div className="text-[10px] text-pine">
                          {sug === "searching" ? t("travelOrders.kmSearching") : sug === "known" ? t("travelOrders.kmSuggested") : sug === "form" ? t("travelOrders.kmSameRoute") : t("travelOrders.kmMap", { routes: sug.split(":")[1] ?? "1" })}
                          {sug.startsWith("map:") && <div className="max-w-[14rem] text-[10px] leading-tight text-ink-secondary">{sug.split(":").slice(2).join(":")}</div>}
                        </div>
                      )}
                    </td>
                    {(["stravne", "nocleh", "vedlejsi"] as const).map((k) => (
                      <td key={k} className="p-1">
                        <input inputMode="decimal" aria-label={`${t(`travelOrders.leg.${k}`)} ${i + 1}`} className={cell} disabled={disabled} value={l[k]} onChange={(e) => setLeg(i, { [k]: e.target.value })} />
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-1 pt-2 text-right tabular-nums">{c ? czMoney(c.total) : ""}</td>
                    <td className="p-1 pt-1.5">
                      {draft && form.legs.length > 1 && (
                        <button
                          type="button"
                          className="text-ink-secondary hover:text-red-700"
                          aria-label={t("travelOrders.leg.remove")}
                          onClick={() => {
                            set("legs", form.legs.filter((_, j) => j !== i));
                            setPicked(new Set());
                            setSuggested({});
                          }}
                        >
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
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                // The next leg goes back: from where the last one ended, to where it started.
                const last = form.legs[form.legs.length - 1];
                const next = { ...emptyLeg(), date: last?.date ?? "", fromPlace: last?.toPlace ?? "", toPlace: last?.fromPlace ?? "" };
                const legs = [...form.legs, next];
                set("legs", legs);
                lookupKm(legs.length - 1, next.fromPlace, next.toPlace, legs);
              }}
            >
              + {t("travelOrders.leg.add")}
            </button>
            <button type="button" className={btn} disabled={!picked.size} onClick={duplicatePicked}>
              {t("travelOrders.leg.duplicate", { count: String(picked.size) })}
            </button>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[12px] text-amber-800">
            {warnings.map((w, j) => (
              <li key={j}>{t(`travelOrders.warning.${w.code}`, { n: String(w.leg + 1) })}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
