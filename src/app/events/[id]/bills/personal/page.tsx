"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatCzk } from "@/lib/format";
import { evenSplit, fromHal, splitStatus, tallyAmount, toHal } from "@/lib/personal-bills";

// Osobní účtenky (2026-10-30): purchases for people that aren't the event's expense -- never in the official
// bills, their export or Rozpočet. Each bill has an author (who paid; default the event's Pokladník, or the event's
// own money) and is split between people evenly, by amounts, or as a tally ("čárky": pieces × price). Through the
// event (the default) Platby pays the author back and nets each person's part with their payout.
type Person = { key: string; name: string; authorId: string | null; childId: string | null; hasBank: boolean };
type Share = { authorId: string; name: string; amountCzk: number; quantity: number | null; settled: boolean };
// assign: who the line is for (person keys); empty = not assigned yet.
type LineItem = { description: string | null; total: number | null; assign?: string[] };
type Bill = {
  id: string;
  billDate: string;
  merchantName: string | null;
  totalAmount: number;
  currency: string;
  amountCzk: number | null;
  splitMode: "even" | "custom";
  viaEvent: boolean;
  unitLabel: string | null;
  unitPrice: number | null;
  note: string | null;
  hasFile: boolean;
  fromBill: boolean;
  lineItems: LineItem[];
  author: { id: string; name: string } | null;
  shares: Share[];
  status: { assigned: number; remaining: number; complete: boolean } | null;
};
type Item = { id: string; name: string; unitPrice: number; active: boolean };
type Data = { treasurerAuthorId: string | null; eventStatus: string; people: Person[]; bills: Bill[] };
type Draft = {
  id: string | null;
  kind: "bill" | "tally";
  billDate: string;
  merchantName: string;
  totalAmount: string;
  currency: string;
  author: string;
  viaEvent: boolean;
  // items ("podle položek"): each receipt line goes to its people (split evenly between them); saved as amounts.
  splitMode: "even" | "custom" | "items";
  // even: the picked people; custom: everyone's amount; tally: everyone's pieces.
  picked: Record<string, string>;
  unitLabel: string;
  unitPrice: string;
  note: string;
  gcsObjectPath: string | null;
  originalFilename: string | null;
  // The receipt to show next to the form (a saved bill's file, or the one just uploaded) and its AI lines.
  previewUrl: string | null;
  previewIsPdf: boolean;
  lineItems: LineItem[];
};

const inputSm = "rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const today = () => new Date().toISOString().slice(0, 10);
const dec = (v: string) => Number(String(v).replace(",", "."));
const QUICK = [1, 2, 3, 5, 10];

/** "Podle položek": each line split evenly between its people, summed per person (to the haléř). */
function itemAmounts(lines: LineItem[]) {
  const per = new Map<string, number>();
  for (const l of lines) {
    const who = l.assign ?? [];
    // Discount lines (negative) aren't split: what's left is assigned with "Zbytek".
    if (!who.length || !l.total || l.total <= 0) continue;
    evenSplit(l.total, who.length).forEach((part, i) => per.set(who[i], (per.get(who[i]) ?? 0) + toHal(part)));
  }
  return new Map([...per].map(([k, h]) => [k, fromHal(h)]));
}

export default function PersonalBillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showItems, setShowItems] = useState(false);
  const base = `/api/events/${id}/personal-bills`;

  const load = useCallback(async () => {
    const [res, it] = await Promise.all([fetch(base, { cache: "no-store" }).catch(() => null), fetch(`${base}/items`, { cache: "no-store" }).catch(() => null)]);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
    if (it?.ok) setItems(await it.json());
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

  const blank = (kind: Draft["kind"]): Draft => {
    const item = items.find((i) => i.active);
    return {
      id: null,
      kind,
      billDate: today(),
      merchantName: "",
      totalAmount: "",
      currency: "CZK",
      author: treasurerKey,
      viaEvent: true,
      splitMode: "even",
      picked: kind === "tally" ? Object.fromEntries(data.people.map((p) => [p.key, ""])) : {},
      unitLabel: kind === "tally" ? item?.name ?? "" : "",
      unitPrice: kind === "tally" && item ? String(item.unitPrice) : "",
      note: "",
      gcsObjectPath: null,
      originalFilename: null,
      previewUrl: null,
      previewIsPdf: false,
      lineItems: [],
    };
  };
  const editDraft = (b: Bill): Draft => {
    const kind = b.unitPrice != null ? "tally" : "bill";
    const has = Object.fromEntries(b.shares.map((s) => [keyOfAuthor(s.authorId), String(kind === "tally" ? s.quantity ?? "" : s.amountCzk)]));
    return {
      id: b.id,
      kind,
      billDate: b.billDate,
      merchantName: b.merchantName ?? "",
      totalAmount: String(b.totalAmount),
      currency: b.currency,
      author: b.author ? keyOfAuthor(b.author.id) : "event",
      viaEvent: b.viaEvent,
      splitMode: b.lineItems.some((l) => l.assign?.length) ? "items" : b.splitMode,
      picked: kind === "tally" || b.splitMode === "custom" ? { ...Object.fromEntries(data.people.map((p) => [p.key, kind === "tally" ? "" : "0"])), ...has } : has,
      unitLabel: b.unitLabel ?? "",
      unitPrice: b.unitPrice == null ? "" : String(b.unitPrice),
      note: b.note ?? "",
      gcsObjectPath: null,
      originalFilename: null,
      previewUrl: b.hasFile ? `${base}/${b.id}/file` : null,
      previewIsPdf: false,
      lineItems: b.lineItems,
    };
  };

  async function setTreasurer(key: string) {
    await fetch(`${base}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ treasurer: key || null }) }).catch(() => null);
    load();
  }
  async function remove(b: Bill) {
    if (!(await confirm({ message: t("personalBills.confirmDelete", { name: b.merchantName ?? b.unitLabel ?? formatCzk(b.totalAmount) }), danger: true }))) return;
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
    <div className="mx-auto max-w-6xl p-4 md:p-8">
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={closed} onClick={() => { setError(null); setDraft(blank("bill")); }} className={btnPrimary}>
            + {t("personalBills.new")}
          </button>
          <button type="button" disabled={closed} onClick={() => { setError(null); setDraft(blank("tally")); }} className={btn}>
            + {t("personalBills.newTally")}
          </button>
          <button type="button" onClick={() => setShowItems(!showItems)} className="text-[13px] text-ember hover:underline">
            {t("personalBills.itemsTitle")}
          </button>
        </div>
      )}
      {showItems && !draft && <ItemsEditor base={base} items={items} onChanged={load} />}
      {draft && <BillForm base={base} people={data.people} items={items.filter((i) => i.active)} draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); load(); }} />}

      {data.bills.length === 0 && !draft && <p className="text-[14px] text-ink-secondary">{t("personalBills.empty")}</p>}
      <div className="flex flex-col gap-3">
        {data.bills.map((b) => {
          const settled = b.shares.some((s) => s.settled);
          const tally = b.unitPrice != null;
          return (
            <div key={b.id} className={"rounded-lg border p-3 " + (b.status && !b.status.complete && !tally ? "border-red-300" : "border-mist")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-ink">
                    {tally ? (
                      <>
                        {b.unitLabel || t("personalBills.tally")} · {formatCzk(b.unitPrice!)} × {b.shares.reduce((s, x) => s + (x.quantity ?? 0), 0)} = {formatCzk(b.totalAmount)}
                      </>
                    ) : (
                      <>
                        {b.merchantName || t("personalBills.noMerchant")} · {b.currency === "CZK" ? formatCzk(b.totalAmount) : `${b.totalAmount} ${b.currency}`}
                        {b.currency !== "CZK" && b.amountCzk != null && <span className="ml-1 text-[13px] font-normal text-ink-secondary">({formatCzk(b.amountCzk)})</span>}
                      </>
                    )}
                  </div>
                  <div className="text-[12.5px] text-ink-secondary">
                    {new Date(`${b.billDate}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" })} · {b.author ? t("personalBills.paidBy", { name: b.author.name }) : t("personalBills.paidByEvent")}
                    {" · "}
                    {b.viaEvent || !b.author ? t("personalBills.viaEventShort") : t("personalBills.directShort")}
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
                  {!tally && b.status && !b.status.complete && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{t("personalBills.notSplit", { remaining: formatCzk(b.status.remaining) })}</span>}
                  {b.amountCzk == null && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800">{t("personalBills.noRate")}</span>}
                  <button type="button" disabled={closed || settled} title={settled ? t("personalBills.settledLocked") : undefined} onClick={() => { setError(null); setDraft(editDraft(b)); }} className="text-ember hover:underline disabled:opacity-40">
                    {t("common.edit")}
                  </button>
                  {!tally && (
                    <button type="button" disabled={closed || settled} onClick={() => toOfficial(b)} className="text-ink-secondary hover:underline disabled:opacity-40">
                      {t("personalBills.toOfficial")}
                    </button>
                  )}
                  <button type="button" disabled={closed || settled} onClick={() => remove(b)} className="text-red-600 hover:underline disabled:opacity-40">
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px]">
                {b.shares.map((s) => (
                  <span key={s.authorId} className={"rounded-full px-2 py-0.5 " + (s.settled ? "bg-pine/15 text-pine" : "bg-paper-2 text-ink")}>
                    {s.name}: {s.quantity != null && `${s.quantity}× = `}
                    {formatCzk(s.amountCzk)}
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

/** "Ceník čárek": the organization's repeated items with their base price per piece. */
function ItemsEditor({ base, items, onChanged }: { base: string; items: Item[]; onChanged: () => void }) {
  const { t } = useTranslations();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const call = async (method: string, body?: unknown, q = "") => {
    await fetch(`${base}/items${q}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    onChanged();
  };
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper p-3">
      <p className="text-[12.5px] text-ink-secondary">{t("personalBills.itemsHint")}</p>
      {items.map((i) => (
        <div key={i.id} className={"flex flex-wrap items-center gap-2 text-[13px] " + (i.active ? "" : "opacity-60")}>
          <input defaultValue={i.name} onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && call("PATCH", { id: i.id, name: e.target.value })} className={inputSm + " w-48"} />
          <input defaultValue={String(i.unitPrice)} onBlur={(e) => dec(e.target.value) > 0 && dec(e.target.value) !== i.unitPrice && call("PATCH", { id: i.id, unitPrice: e.target.value })} inputMode="decimal" className={inputSm + " w-24 text-right"} />
          <span className="text-ink-secondary">{t("personalBills.perPiece")}</span>
          <button type="button" onClick={() => call("PATCH", { id: i.id, active: !i.active })} className="text-[12px] text-ink-secondary hover:text-ink">
            {i.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
          </button>
          <button type="button" onClick={() => call("DELETE", undefined, `?itemId=${i.id}`)} className="text-[12px] text-red-600 hover:underline">
            {t("common.delete")}
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !(dec(price) > 0)) return;
          call("POST", { name, unitPrice: price });
          setName("");
          setPrice("");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("personalBills.itemName")} className={inputSm + " w-48"} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Kč" className={inputSm + " w-24 text-right"} />
        <button type="submit" disabled={!name.trim() || !(dec(price) > 0)} className={btn}>
          + {t("kitchen.lists.add")}
        </button>
      </form>
    </div>
  );
}

function BillForm({ base, people, items, draft: d, setDraft, onSaved }: { base: string; people: Person[]; items: Item[]; draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState<number | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const tally = d.kind === "tally";
  const price = dec(d.unitPrice) || 0;
  const byItems = itemAmounts(d.lineItems);
  const keys = d.splitMode === "items" ? [...byItems.keys()] : Object.keys(d.picked);
  const total = tally ? keys.reduce((s, k) => s + tallyAmount(dec(d.picked[k]) || 0, price), 0) : dec(d.totalAmount) || 0;
  const parts = d.splitMode === "even" ? evenSplit(total, keys.length) : d.splitMode === "items" ? keys.map((k) => byItems.get(k) ?? 0) : keys.map((k) => dec(d.picked[k]) || 0);
  const status = splitStatus(total, parts);
  const pieces = keys.reduce((s, k) => s + (dec(d.picked[k]) || 0), 0);
  const toggle = (key: string, on: boolean) => {
    const picked = { ...d.picked };
    if (on) picked[key] = "";
    else delete picked[key];
    set({ picked });
  };
  // "Podle částek": an amount field for everyone (0 = nothing), no ticking first.
  const setMode = (m: Draft["splitMode"]) =>
    set({ splitMode: m, picked: m === "custom" ? { ...Object.fromEntries(people.map((p) => [p.key, "0"])), ...Object.fromEntries(Object.entries(d.picked).filter(([, v]) => v !== "")) } : Object.fromEntries(Object.entries(d.picked).filter(([, v]) => dec(v) > 0 || v === "").map(([k]) => [k, ""])) });
  const addPieces = (key: string, n: number) => set({ picked: { ...d.picked, [key]: String(Math.max(0, (dec(d.picked[key]) || 0) + n)) } });
  const setLines = (lineItems: LineItem[]) => set({ lineItems });
  // "Zbytek →": whatever isn't assigned yet goes to one person (e.g. the author: "the rest is mine").
  const [restTo, setRestTo] = useState("");
  function assignRest() {
    if (!restTo || status.remaining <= 0) return;
    if (d.splitMode === "custom") return set({ picked: { ...d.picked, [restTo]: String(fromHal(toHal(dec(d.picked[restTo] ?? "0") || 0) + toHal(status.remaining))) } });
    // Items: the unassigned lines, and what the lines don't cover (discounts, a total typed by hand) as a line.
    const lines = d.lineItems.map((l) => (l.assign?.length || !l.total ? l : { ...l, assign: [restTo] }));
    const left = toHal(total) - [...itemAmounts(lines).values()].reduce((sum, v) => sum + toHal(v), 0);
    setLines(left > 0 ? [...lines, { description: t("personalBills.restLine"), total: fromHal(left), assign: [restTo] }] : lines);
  }

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
      previewUrl: `${base}/scan?path=${encodeURIComponent(r.gcsObjectPath)}`,
      previewIsPdf: /\.pdf$/i.test(file.name),
      lineItems: Array.isArray(r.lineItems) ? r.lineItems : [],
    });
  }
  async function save() {
    setBusy(true);
    setError(null);
    const shares = tally
      ? keys.filter((k) => dec(d.picked[k]) > 0).map((k) => ({ person: k, quantity: d.picked[k] }))
      : d.splitMode === "items"
        ? keys.filter((k) => (byItems.get(k) ?? 0) > 0).map((k) => ({ person: k, amountCzk: byItems.get(k) }))
        : d.splitMode === "custom"
        ? keys.filter((k) => dec(d.picked[k]) > 0).map((k) => ({ person: k, amountCzk: d.picked[k] }))
        : keys.map((k) => ({ person: k }));
    const res = await fetch(d.id ? `${base}/${d.id}` : base, {
      method: d.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billDate: d.billDate,
        merchantName: d.merchantName,
        totalAmount: d.totalAmount,
        currency: d.currency,
        author: d.author,
        viaEvent: d.viaEvent,
        splitMode: tally || d.splitMode === "items" ? "custom" : d.splitMode,
        unitPrice: tally ? d.unitPrice : null,
        unitLabel: tally ? d.unitLabel : null,
        shares,
        note: d.note,
        gcsObjectPath: d.gcsObjectPath,
        originalFilename: d.originalFilename,
        lineItems: d.lineItems,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t(`personalBills.error.${(await res?.json().catch(() => null))?.error ?? "failed"}`));
    onSaved();
  }

  const preview = !tally && (d.previewUrl || (d.lineItems.length > 0 && d.splitMode !== "items"));
  const form = (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{t(d.id ? "personalBills.editTitle" : tally ? "personalBills.newTally" : "personalBills.new")}</h2>
        {!d.id && !tally && (
          <label className={btn + " cursor-pointer"}>
            {scanning ? t("personalBills.reading") : d.gcsObjectPath ? `✓ ${d.originalFilename}` : t("personalBills.scan")}
            <input type="file" accept="image/*,.pdf" capture="environment" disabled={scanning} className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
          </label>
        )}
        {!tally && <span className="text-[12px] text-ink-secondary">{t("personalBills.scanHint")}</span>}
      </div>

      {tally ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary sm:col-span-2">
            {t("personalBills.tallyItem")}
            <span className="flex gap-1">
              <select
                value={items.find((i) => i.name === d.unitLabel)?.id ?? ""}
                onChange={(e) => {
                  const it = items.find((i) => i.id === e.target.value);
                  if (it) set({ unitLabel: it.name, unitPrice: String(it.unitPrice) });
                }}
                className={inputSm}
              >
                <option value="">—</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatCzk(i.unitPrice)})
                  </option>
                ))}
              </select>
              <input value={d.unitLabel} onChange={(e) => set({ unitLabel: e.target.value })} placeholder={t("personalBills.itemName")} className={inputSm + " min-w-0 flex-1"} />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
            {t("personalBills.unitPrice")}
            <input value={d.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} inputMode="decimal" className={inputSm + " text-right"} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
            {t("personalBills.date")}
            <input type="date" value={d.billDate} onChange={(e) => set({ billDate: e.target.value })} className={inputSm} />
          </label>
        </div>
      ) : (
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
      )}

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink">
        <label className="flex flex-wrap items-center gap-2">
          {t("personalBills.author")}
          <select value={d.author} onChange={(e) => set({ author: e.target.value })} className={inputSm}>
            <option value="">—</option>
            <option value="event">{t("personalBills.authorEvent")}</option>
            {people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {d.author && d.author !== "event" && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={d.viaEvent} onChange={(e) => set({ viaEvent: e.target.checked })} />
            {t("personalBills.viaEvent")}
          </label>
        )}
      </div>
      <p className="-mt-2 text-[12px] text-ink-secondary">
        {d.author === "event" ? t("personalBills.authorEventHint") : d.viaEvent ? t("personalBills.viaEventHint") : t("personalBills.directHint")}
      </p>

      {tally ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="font-medium text-ink">{t("personalBills.tallyWho")}</span>
            <button type="button" onClick={() => setWizard(0)} className={btn}>
              {t("personalBills.wizard")}
            </button>
            <span className="text-ink-secondary">{t("personalBills.tallyTotal", { pieces: String(pieces), total: formatCzk(total) })}</span>
          </div>
          {wizard != null && people[wizard] ? (
            <TallyWizard
              index={wizard}
              people={people}
              value={d.picked[people[wizard].key] ?? ""}
              price={price}
              onAdd={(n) => addPieces(people[wizard].key, n)}
              onSet={(v) => set({ picked: { ...d.picked, [people[wizard].key]: v } })}
              onGo={(i) => setWizard(i >= people.length ? null : Math.max(0, i))}
            />
          ) : (
            <div className="grid gap-1 md:grid-cols-2">
              {people.map((p) => (
                <div key={p.key} className="flex items-center gap-1.5 text-[13.5px] text-ink">
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <input value={d.picked[p.key] ?? ""} onChange={(e) => set({ picked: { ...d.picked, [p.key]: e.target.value } })} inputMode="decimal" placeholder="0" className={inputSm + " w-14 text-right"} />
                  {QUICK.slice(0, 3).map((n) => (
                    <button key={n} type="button" onClick={() => addPieces(p.key, n)} className="rounded border border-mist px-1.5 text-[12px] hover:bg-paper-2">
                      +{n}
                    </button>
                  ))}
                  <span className="w-20 text-right text-[12px] tabular-nums text-ink-secondary">{dec(d.picked[p.key] ?? "") > 0 ? formatCzk(tallyAmount(dec(d.picked[p.key]), price)) : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="font-medium text-ink">{t("personalBills.splitBetween")}</span>
            {(["even", "custom", "items"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" checked={d.splitMode === m} onChange={() => (m === "items" ? set({ splitMode: "items", lineItems: d.lineItems.length ? d.lineItems : [{ description: "", total: null, assign: [] }] }) : setMode(m))} />
                {t(`personalBills.mode.${m}`)}
              </label>
            ))}
            {d.splitMode === "even" && keys.length > 0 && (
              <button type="button" onClick={() => set({ picked: {} })} className="text-[12px] text-ink-secondary hover:underline">
                {t("personalBills.clearPeople")}
              </button>
            )}
          </div>
          {d.splitMode === "items" ? (
            <ItemsSplit lines={d.lineItems} people={people} onChange={setLines} />
          ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {people.map((p) => {
              const on = p.key in d.picked;
              const i = keys.indexOf(p.key);
              return d.splitMode === "custom" ? (
                <label key={p.key} className="flex items-center gap-2 text-[13.5px] text-ink">
                  <span className="flex-1">{p.name}</span>
                  <input value={d.picked[p.key] ?? "0"} onFocus={(e) => e.target.select()} onChange={(e) => set({ picked: { ...d.picked, [p.key]: e.target.value } })} inputMode="decimal" className={inputSm + " w-24 text-right"} />
                </label>
              ) : (
                <label key={p.key} className="flex items-center gap-2 text-[13.5px] text-ink">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(p.key, e.target.checked)} />
                  <span className="flex-1">{p.name}</span>
                  {on && <span className="tabular-nums text-ink-secondary">{formatCzk(parts[i] ?? 0)}</span>}
                </label>
              );
            })}
          </div>
          )}
          {d.splitMode === "items" && keys.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[12.5px]">
              {keys.map((k) => (
                <span key={k} className="rounded-full bg-paper-2 px-2 py-0.5 text-ink">
                  {people.find((p) => p.key === k)?.name ?? "?"}: {formatCzk(byItems.get(k) ?? 0)}
                </span>
              ))}
            </div>
          )}
          {d.splitMode !== "even" && total > 0 && status.remaining > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              {t("personalBills.restTo")}
              <select value={restTo} onChange={(e) => setRestTo(e.target.value)} className={inputSm}>
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!restTo} onClick={assignRest} className={btn}>
                {t("personalBills.restAssign", { amount: formatCzk(status.remaining) })}
              </button>
            </div>
          )}
          {total > 0 && (keys.length > 0 || d.splitMode !== "even") && (
            <p className={"text-[13px] " + (status.complete ? "text-pine" : "text-red-700")}>
              {status.complete
                ? t("personalBills.splitComplete", { total: formatCzk(total) })
                : t("personalBills.splitProgress", { assigned: formatCzk(status.assigned), total: formatCzk(total), remaining: formatCzk(status.remaining) })}
              {d.currency !== "CZK" && <span className="ml-1 text-ink-secondary">{t("personalBills.foreignHint")}</span>}
            </p>
          )}
        </div>
      )}
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

  // With a receipt: two columns like the bill detail -- the document and its lines left, the form right.
  return (
    <div className="mb-5 flex flex-col gap-4 rounded-lg border border-mist bg-paper p-4 lg:flex-row">
      {preview && (
        <div className="flex w-full flex-col gap-2 lg:w-[45%]">
          {d.previewUrl &&
            (d.previewIsPdf ? (
              <iframe src={d.previewUrl} title={t("personalBills.file")} className="h-[60vh] w-full rounded border border-mist" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.previewUrl} alt={t("personalBills.file")} className="max-h-[60vh] w-full rounded border border-mist object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ))}
          {d.previewUrl && (
            <a href={d.previewUrl} target="_blank" rel="noreferrer" className="text-[12px] text-ember hover:underline">
              {t("personalBills.openFile")}
            </a>
          )}
          {d.lineItems.length > 0 && d.splitMode !== "items" && (
            <table className="w-full text-[12.5px]">
              <tbody>
                {d.lineItems.map((l, i) => (
                  <tr key={i} className="border-b border-mist/50">
                    <td className="py-0.5 text-ink">{l.description || "—"}</td>
                    <td className="py-0.5 text-right tabular-nums text-ink-secondary">{l.total != null ? formatCzk(l.total) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {form}
    </div>
  );
}

/** "Průvodce": one person at a time, big buttons -- for counting the tally off a sheet. */
function TallyWizard({ index, people, value, price, onAdd, onSet, onGo }: { index: number; people: Person[]; value: string; price: number; onAdd: (n: number) => void; onSet: (v: string) => void; onGo: (i: number) => void }) {
  const { t } = useTranslations();
  const n = dec(value) || 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-ember/40 p-4">
      <div className="text-[12px] text-ink-secondary">
        {index + 1} / {people.length}
      </div>
      <div className="text-[22px] font-semibold text-ink">{people[index].name}</div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onAdd(-1)} disabled={n <= 0} className="h-11 w-11 rounded-full border border-mist text-[20px] disabled:opacity-40">
          −
        </button>
        <input value={value} onChange={(e) => onSet(e.target.value)} inputMode="decimal" placeholder="0" className="h-12 w-20 rounded-lg border border-mist bg-paper-2 text-center text-[22px] tabular-nums" />
        <span className="w-24 text-[14px] tabular-nums text-ink-secondary">{n > 0 ? formatCzk(tallyAmount(n, price)) : ""}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => onAdd(q)} className="h-11 min-w-[3rem] rounded-lg bg-paper-2 px-3 text-[16px] font-medium text-ink hover:bg-mist">
            +{q}
          </button>
        ))}
        <button type="button" onClick={() => onSet("")} className="h-11 rounded-lg px-3 text-[14px] text-ink-secondary hover:bg-paper-2">
          {t("personalBills.wizardClear")}
        </button>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => onGo(index - 1)} disabled={index === 0} className={btn}>
          ← {t("personalBills.wizardBack")}
        </button>
        <button type="button" onClick={() => onGo(index + 1)} className="rounded-lg bg-ember px-5 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {index === people.length - 1 ? t("personalBills.wizardDone") : `${t("personalBills.wizardNext")} →`}
        </button>
      </div>
    </div>
  );
}

/** "Podle položek": the receipt's lines (the AI's, or typed), each with its people -- a line for several people is
 * split evenly between them. "+ všichni" puts everyone on a shared line (bread, a bottle of water). */
function ItemsSplit({ lines, people, onChange }: { lines: LineItem[]; people: Person[]; onChange: (l: LineItem[]) => void }) {
  const { t } = useTranslations();
  const setLine = (i: number, patch: Partial<LineItem>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const name = (key: string) => people.find((p) => p.key === key)?.name ?? "?";
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l, i) => (
        <div key={i} className={"flex flex-col gap-1 rounded-md border px-2 py-1.5 " + (l.assign?.length ? "border-mist/60" : "border-amber-400/70")}>
          <div className="flex flex-wrap items-center gap-2">
            <input value={l.description ?? ""} onChange={(e) => setLine(i, { description: e.target.value })} placeholder={t("personalBills.lineName")} className={inputSm + " min-w-[10rem] flex-1"} />
            <input value={l.total ?? ""} onChange={(e) => setLine(i, { total: e.target.value === "" ? null : dec(e.target.value) })} inputMode="decimal" placeholder="Kč" className={inputSm + " w-24 text-right"} />
            <button type="button" onClick={() => onChange(lines.filter((_, k) => k !== i))} className="text-[12px] text-red-600" aria-label={t("common.delete")}>
              ×
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[12px]">
            {(l.assign ?? []).map((k) => (
              <button key={k} type="button" onClick={() => setLine(i, { assign: (l.assign ?? []).filter((x) => x !== k) })} className="rounded-full bg-pine/15 px-2 py-0.5 text-pine hover:bg-pine/25" title={t("common.delete")}>
                {name(k)} ×
              </button>
            ))}
            <select value="" onChange={(e) => e.target.value && setLine(i, { assign: [...(l.assign ?? []), e.target.value] })} className={inputSm + " !py-0.5 text-[12px]"} aria-label={t("personalBills.addPerson")}>
              <option value="">+ {t("personalBills.addPerson")}</option>
              {people.filter((p) => !(l.assign ?? []).includes(p.key)).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setLine(i, { assign: people.map((p) => p.key) })} className="text-[12px] text-ember hover:underline">
              + {t("personalBills.everyone")}
            </button>
            {(l.assign?.length ?? 0) > 1 && l.total ? <span className="text-ink-secondary">{t("personalBills.perPerson", { amount: formatCzk(evenSplit(l.total, l.assign!.length)[0]) })}</span> : null}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, { description: "", total: null, assign: [] }])} className="self-start text-[12.5px] text-ember hover:underline">
        + {t("personalBills.addLine")}
      </button>
    </div>
  );
}
