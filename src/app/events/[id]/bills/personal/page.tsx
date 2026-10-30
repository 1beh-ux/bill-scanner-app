"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatCzk } from "@/lib/format";
import { evenSplit, splitStatus } from "@/lib/personal-bills";

// Osobní účtenky (2026-10-30): purchases for people that aren't the event's expense -- never in the official
// bills, their export or Rozpočet. Each bill has an author (who paid; default the event's Pokladník) and is split
// between people evenly or by amounts; Platby nets what people owe the Pokladník with their payouts.
type Person = { key: string; name: string; authorId: string | null; childId: string | null; hasBank: boolean };
type Share = { authorId: string; name: string; amountCzk: number; settled: boolean };
type Bill = {
  id: string;
  billDate: string;
  merchantName: string | null;
  totalAmount: number;
  currency: string;
  amountCzk: number | null;
  splitMode: "even" | "custom";
  note: string | null;
  hasFile: boolean;
  fromBill: boolean;
  author: { id: string; name: string };
  shares: Share[];
  status: { assigned: number; remaining: number; complete: boolean } | null;
};
type Data = { treasurerAuthorId: string | null; eventStatus: string; people: Person[]; bills: Bill[] };
type Draft = { id: string | null; billDate: string; merchantName: string; totalAmount: string; currency: string; author: string; splitMode: "even" | "custom"; picked: Record<string, string>; note: string; gcsObjectPath: string | null; originalFilename: string | null };

const inputSm = "rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const today = () => new Date().toISOString().slice(0, 10);
const dec = (v: string) => Number(String(v).replace(",", "."));

export default function PersonalBillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/events/${id}/personal-bills`;

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
  }, [base]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("personalBills.noAccess")}</div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const closed = data.eventStatus === "closed";
  const keyOfAuthor = (authorId: string) => data.people.find((p) => p.authorId === authorId)?.key ?? `a:${authorId}`;
  const treasurerKey = data.treasurerAuthorId ? keyOfAuthor(data.treasurerAuthorId) : "";

  const newDraft = (): Draft => ({ id: null, billDate: today(), merchantName: "", totalAmount: "", currency: "CZK", author: treasurerKey, splitMode: "even", picked: {}, note: "", gcsObjectPath: null, originalFilename: null });
  const editDraft = (b: Bill): Draft => ({
    id: b.id,
    billDate: b.billDate,
    merchantName: b.merchantName ?? "",
    totalAmount: String(b.totalAmount),
    currency: b.currency,
    author: keyOfAuthor(b.author.id),
    splitMode: b.splitMode,
    picked: Object.fromEntries(b.shares.map((s) => [keyOfAuthor(s.authorId), String(s.amountCzk)])),
    note: b.note ?? "",
    gcsObjectPath: null,
    originalFilename: null,
  });

  async function setTreasurer(key: string) {
    await fetch(`${base}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ treasurer: key || null }) }).catch(() => null);
    load();
  }
  async function remove(b: Bill) {
    if (!(await confirm({ message: t("personalBills.confirmDelete", { name: b.merchantName ?? formatCzk(b.totalAmount) }), danger: true }))) return;
    const res = await fetch(`${base}/${b.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setError(t(`personalBills.error.${(await res?.json().catch(() => null))?.error ?? "failed"}`));
    load();
  }
  async function toOfficial(b: Bill) {
    if (!(await confirm({ message: t("personalBills.confirmToOfficial") }))) return;
    const res = await fetch(`${base}/${b.id}/to-official`, { method: "POST" }).catch(() => null);
    if (!res?.ok) setError(t(`personalBills.error.${(await res?.json().catch(() => null))?.error ?? "failed"}`));
    load();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("personalBills.title")}</h1>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-secondary">{t("personalBills.hint")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-mist bg-paper p-3">
        <label className="flex items-center gap-2 text-[13px] text-ink">
          {t("personalBills.treasurer")}
          <select value={treasurerKey} onChange={(e) => setTreasurer(e.target.value)} className={inputSm}>
            <option value="">—</option>
            {data.people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[12px] text-ink-secondary">{t("personalBills.treasurerHint")}</span>
        <a href={`/events/${id}/payments`} className="ml-auto text-[13px] text-ember hover:underline">
          {t("nav.payments")} →
        </a>
      </div>

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {!draft && (
        <button type="button" disabled={closed} onClick={() => { setError(null); setDraft(newDraft()); }} className={btnPrimary + " mb-4"}>
          + {t("personalBills.new")}
        </button>
      )}
      {draft && <BillForm base={base} people={data.people} draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); load(); }} />}

      {data.bills.length === 0 && !draft && <p className="text-[14px] text-ink-secondary">{t("personalBills.empty")}</p>}
      <div className="flex flex-col gap-3">
        {data.bills.map((b) => {
          const settled = b.shares.some((s) => s.settled);
          return (
            <div key={b.id} className={"rounded-lg border p-3 " + (b.status && !b.status.complete ? "border-red-300" : "border-mist")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-ink">
                    {b.merchantName || t("personalBills.noMerchant")} · {b.currency === "CZK" ? formatCzk(b.totalAmount) : `${b.totalAmount} ${b.currency}`}
                    {b.currency !== "CZK" && b.amountCzk != null && <span className="ml-1 text-[13px] font-normal text-ink-secondary">({formatCzk(b.amountCzk)})</span>}
                  </div>
                  <div className="text-[12.5px] text-ink-secondary">
                    {new Date(`${b.billDate}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" })} · {t("personalBills.paidBy", { name: b.author.name })}
                    {b.author.id === data.treasurerAuthorId && ` (${t("personalBills.treasurerShort")})`}
                    {b.hasFile && (
                      <>
                        {" · "}
                        <a href={`${base}/${b.id}/file`} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                          {t("personalBills.file")}
                        </a>
                      </>
                    )}
                  </div>
                  {b.note && <p className="text-[12.5px] text-ink-secondary">{b.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                  {b.status && !b.status.complete && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{t("personalBills.notSplit", { remaining: formatCzk(b.status.remaining) })}</span>}
                  {b.amountCzk == null && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800">{t("personalBills.noRate")}</span>}
                  <button type="button" disabled={closed || settled} title={settled ? t("personalBills.settledLocked") : undefined} onClick={() => { setError(null); setDraft(editDraft(b)); }} className="text-ember hover:underline disabled:opacity-40">
                    {t("common.edit")}
                  </button>
                  <button type="button" disabled={closed || settled} onClick={() => toOfficial(b)} className="text-ink-secondary hover:underline disabled:opacity-40">
                    {t("personalBills.toOfficial")}
                  </button>
                  <button type="button" disabled={closed || settled} onClick={() => remove(b)} className="text-red-600 hover:underline disabled:opacity-40">
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px]">
                {b.shares.map((s) => (
                  <span key={s.authorId} className={"rounded-full px-2 py-0.5 " + (s.settled ? "bg-pine/15 text-pine" : "bg-paper-2 text-ink")}>
                    {s.name}: {formatCzk(s.amountCzk)}
                    {s.settled && " ✓"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BillForm({ base, people, draft: d, setDraft, onSaved }: { base: string; people: Person[]; draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const total = dec(d.totalAmount) || 0;
  // CZK split preview (a foreign currency is converted with the ČNB rate on save).
  const keys = Object.keys(d.picked);
  const parts = d.splitMode === "even" ? evenSplit(total, keys.length) : keys.map((k) => dec(d.picked[k]) || 0);
  const status = splitStatus(total, parts);
  const toggle = (key: string, on: boolean) => {
    const picked = { ...d.picked };
    if (on) picked[key] = "";
    else delete picked[key];
    set({ picked });
  };

  async function scan(file: File) {
    setScanning(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/scan`, { method: "POST", body: form }).catch(() => null);
    const r = res?.ok ? await res.json() : null;
    setScanning(false);
    if (!r) return setError(t("personalBills.error.scan_failed"));
    set({
      gcsObjectPath: r.gcsObjectPath,
      originalFilename: r.originalFilename,
      merchantName: d.merchantName || r.merchantName || "",
      billDate: r.billDate || d.billDate,
      totalAmount: d.totalAmount || (r.totalAmount != null ? String(r.totalAmount) : ""),
      currency: ["CZK", "EUR", "PLN"].includes(r.currency) ? r.currency : d.currency,
    });
  }
  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(d.id ? `${base}/${d.id}` : base, {
      method: d.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billDate: d.billDate,
        merchantName: d.merchantName,
        totalAmount: d.totalAmount,
        currency: d.currency,
        author: d.author,
        splitMode: d.splitMode,
        shares: keys.map((k) => ({ person: k, amountCzk: d.picked[k] })),
        note: d.note,
        gcsObjectPath: d.gcsObjectPath,
        originalFilename: d.originalFilename,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t(`personalBills.error.${(await res?.json().catch(() => null))?.error ?? "failed"}`));
    onSaved();
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{t(d.id ? "personalBills.editTitle" : "personalBills.new")}</h2>
        {!d.id && (
          <label className={btn + " cursor-pointer"}>
            {scanning ? t("personalBills.reading") : d.gcsObjectPath ? `✓ ${d.originalFilename}` : t("personalBills.scan")}
            <input type="file" accept="image/*,.pdf" capture="environment" disabled={scanning} className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
          </label>
        )}
        <span className="text-[12px] text-ink-secondary">{t("personalBills.scanHint")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("personalBills.date")}
          <input type="date" value={d.billDate} onChange={(e) => set({ billDate: e.target.value })} className={inputSm} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary sm:col-span-2">
          {t("personalBills.merchant")}
          <input value={d.merchantName} onChange={(e) => set({ merchantName: e.target.value })} placeholder={t("personalBills.merchantPlaceholder")} className={inputSm} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("personalBills.amount")}
          <span className="flex gap-1">
            <input value={d.totalAmount} onChange={(e) => set({ totalAmount: e.target.value })} inputMode="decimal" className={inputSm + " w-full text-right"} />
            <select value={d.currency} onChange={(e) => set({ currency: e.target.value })} className={inputSm}>
              {["CZK", "EUR", "PLN"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
        {t("personalBills.author")}
        <select value={d.author} onChange={(e) => set({ author: e.target.value })} className={inputSm}>
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-secondary">{t("personalBills.authorHint")}</span>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="font-medium text-ink">{t("personalBills.splitBetween")}</span>
          {(["even", "custom"] as const).map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" checked={d.splitMode === m} onChange={() => set({ splitMode: m })} />
              {t(`personalBills.mode.${m}`)}
            </label>
          ))}
          {d.splitMode === "even" && keys.length > 0 && (
            <button type="button" onClick={() => set({ picked: {} })} className="text-[12px] text-ink-secondary hover:underline">
              {t("personalBills.clearPeople")}
            </button>
          )}
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {people.map((p) => {
            const on = p.key in d.picked;
            const i = keys.indexOf(p.key);
            return (
              <label key={p.key} className="flex items-center gap-2 text-[13.5px] text-ink">
                <input type="checkbox" checked={on} onChange={(e) => toggle(p.key, e.target.checked)} />
                <span className="flex-1">{p.name}</span>
                {on && d.splitMode === "custom" && (
                  <input value={d.picked[p.key]} onChange={(e) => set({ picked: { ...d.picked, [p.key]: e.target.value } })} inputMode="decimal" placeholder="0" className={inputSm + " w-24 text-right"} />
                )}
                {on && d.splitMode === "even" && <span className="tabular-nums text-ink-secondary">{formatCzk(parts[i] ?? 0)}</span>}
              </label>
            );
          })}
        </div>
        {keys.length > 0 && total > 0 && (
          <p className={"text-[13px] " + (status.complete ? "text-pine" : "text-red-700")}>
            {status.complete
              ? t("personalBills.splitComplete", { total: formatCzk(total) })
              : t("personalBills.splitProgress", { assigned: formatCzk(status.assigned), total: formatCzk(total), remaining: formatCzk(status.remaining) })}
            {d.currency !== "CZK" && <span className="ml-1 text-ink-secondary">{t("personalBills.foreignHint")}</span>}
          </p>
        )}
      </div>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
        {t("personalBills.note")}
        <input value={d.note} onChange={(e) => set({ note: e.target.value })} className={inputSm} />
      </label>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={busy || !total || !d.author} className={btnPrimary}>
          {t("common.save")}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
