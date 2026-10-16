"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import ColumnPicker from "@/components/ColumnPicker";
import BankHeader from "@/components/bank/BankHeader";
import { useUiPrefs } from "@/lib/use-ui-prefs";
import { dmy, kc, pluralForm, reasonText, type Reason } from "@/components/bank/bank-format";

// Banka -> Pohyby (docs/bank-reconciliation.md A6): tabs, filters, columns, inline classification,
// keyboard triage, totals always visible, bulk actions. Suggestions are only ever confirmed here or
// in Párování by a person.
type Match = { id: string; amountCzk: number; confirmedAt: string | null; tier: "sure" | "possible" | null; reasons: Reason[]; setPaidToAuthor: boolean; bill: { id: string; merchantName: string | null; billDate: string | null; amountCzk: number | null; displayFilename: string | null; originalFilename: string; documentMissing: boolean } };
type Tx = {
  id: string; bookingDate: string; amount: number; currency: string; originalAmount: number | null; originalCurrency: string | null;
  counterpartyAccount: string | null; counterpartyBankCode: string | null; counterpartyName: string | null; vs: string | null; message: string | null; note: string | null; bankType: string | null;
  classification: string; incomeType: string | null; personAuthorId: string | null; person: string | null; reimbursementOf: string | null; noDocumentNeeded: boolean; userNote: string | null; sourceMissing: boolean; matches: Match[];
};
type Totals = { income: number; expense: number; saldo: number; count: number };
type Data = { rows: Tx[]; truncated: boolean; counts: Record<string, number>; totals: Totals; groups: (Totals & { key: string | null; label: string | null })[] | null; authors: { id: string; canonicalName: string }[] };

const TABS = ["todo", "suggested", "paired", "nodoc", "income", "excluded", "all"];
const CLASSES = ["expense", "income", "cash", "transfer", "fee", "private", "other_event"];
const INCOME = ["fee", "grant", "donation", "refund", "other"];
const COLUMNS = ["date", "amount", "counterparty", "vs", "message", "classification", "pairing", "person", "note"];
const REQUIRED = ["date", "amount"];
// Keyboard triage: key -> classification.
const KEYS: Record<string, string> = { s: "private", p: "cash", t: "transfer", f: "fee", v: "expense" };
const input = "rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function BankTransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const { prefs, save } = useUiPrefs();
  const [tab, setTab] = useState("todo");
  const [tier, setTier] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [group, setGroup] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({ tab, ...(tier && { tier }), ...(group && { group }) });
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    return q.toString();
  }, [tab, tier, f, group]);
  const load = useCallback(async () => {
    const r = await fetch(`/api/events/${id}/bank/transactions?${query}`);
    if (r.status === 403) return setDenied(true);
    if (r.ok) setData(await r.json());
  }, [id, query]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the query changes
    load();
  }, [load]);
  useEffect(() => {
    fetch(`/api/events?module=bank`).then((r) => (r.ok ? r.json() : [])).then((evs: { id: string; name: string }[]) => setEvents(evs.filter((e) => e.id !== id))).catch(() => {});
  }, [id]);

  const columns = prefs.bankColumns[id] ?? COLUMNS;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sel = rows.filter((r) => selected.has(r.id));
  const sum = (list: Tx[]) => ({ income: list.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), expense: list.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0), count: list.length });

  async function act(body: object, reload = true) {
    const r = await fetch(`/api/events/${id}/bank/transactions/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const res = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) setMsg(t(`bankTx.error.${res.error ?? "failed"}`));
    if (reload) await load();
    return res;
  }
  const classify = (ids: string[], classification: string, extra: object = {}) => act({ action: "classify", ids, classification, ...extra });

  async function confirmSuggestions(ids: string[] | null) {
    const p = await act({ action: "confirmPreview", ...(ids ? { ids } : { sure: true }) }, false);
    if (!p.count) return setMsg(t("bankTx.nothingToConfirm"));
    if (!(await confirm({ message: t("bankTx.confirmQuestion", { count: String(p.count), sum: kc(p.sum), noun: t(`bankPlural.pair.${pluralForm(p.count)}`) }) }))) return;
    const r = await act({ action: "confirm", ...(ids ? { ids } : { sure: true }) });
    setMsg(t("bankTx.confirmed", { count: String(r.confirmed), sum: kc(r.sum ?? 0) }));
    setSelected(new Set());
  }
  async function bulk(action: string, extra: object = {}) {
    const ids = [...selected];
    if (action === "move") {
      const target = events.find((e) => e.id === (extra as { targetEventId: string }).targetEventId);
      if (!target || !(await confirm({ message: t("bankTx.moveConfirm", { count: String(ids.length), name: target.name }) }))) return;
    }
    if (action === "createBills" && !(await confirm({ message: t("bankTx.createBillsConfirm", { count: String(ids.length), noun: t(`bankPlural.bill.${pluralForm(ids.length)}`) }) }))) return;
    const r = await act({ action, ids, ...extra });
    if (action === "createBills") setMsg(t("bankTx.billsCreated", { count: String(r.created ?? 0), skipped: String(r.skipped ?? 0) }));
    if (action === "move") setMsg(t("bankTx.moved", { count: String(r.moved ?? 0), skipped: String(r.skipped ?? 0) }));
    if (action === "reject") setMsg(t("bankTx.rejected", { count: String(r.rejected ?? 0) }));
    setSelected(new Set());
  }
  async function unpair(m: Match) {
    if (!(await confirm({ message: t("bankTx.unpairConfirm", { amount: kc(m.amountCzk) }), danger: true }))) return;
    const clearPaid = m.setPaidToAuthor ? await confirm({ message: t("bankTx.unpairClearPaid") }) : false;
    await fetch(`/api/events/${id}/bank/matches/${m.id}?clearPaid=${clearPaid ? 1 : 0}`, { method: "DELETE" });
    load();
  }

  // Keyboard triage on the focused row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey || !rows.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
      } else if (e.key === "Enter") router.push(`/events/${id}/bank/pairing?tx=${rows[focus]?.id}`);
      else if (KEYS[e.key.toLowerCase()] && rows[focus]) {
        e.preventDefault();
        classify([rows[focus].id], KEYS[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // classify / router are stable enough for a key handler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focus, id]);
  useEffect(() => {
    tableRef.current?.querySelector(`[data-row="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("bank.noAccess")}</div>;

  const show = (c: string) => columns.includes(c);
  const setFilter = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const amountCell = (r: Tx) => (
    <span className={"tabular-nums " + (r.amount > 0 ? "text-pine" : "text-ink")}>
      {kc(r.amount)}
      {r.originalCurrency && r.originalAmount !== null && <span className="block text-[11px] text-ink-secondary">{kc(r.originalAmount)} {r.originalCurrency}</span>}
    </span>
  );
  const cell: Record<string, (r: Tx) => React.ReactNode> = {
    date: (r) => <span className="whitespace-nowrap">{dmy(r.bookingDate)}{r.sourceMissing && <span title={t("bankTx.sourceMissing")} className="ml-1 text-amber-700">⚠</span>}</span>,
    amount: amountCell,
    counterparty: (r) => (
      <span className="[overflow-wrap:anywhere]">
        {r.counterpartyName ?? ""}
        {r.counterpartyAccount && <span className="block text-[11px] text-ink-secondary">{r.counterpartyAccount}{r.counterpartyBankCode ? `/${r.counterpartyBankCode}` : ""}</span>}
        {r.bankType && <span className="block text-[11px] text-ink-secondary">{r.bankType}</span>}
      </span>
    ),
    vs: (r) => r.vs ?? "",
    message: (r) => <span className="text-ink-secondary [overflow-wrap:anywhere]">{[r.message, r.note].filter(Boolean).join(" · ")}</span>,
    classification: (r) => (
      <div className="flex flex-col gap-1">
        <select value={r.classification} onChange={(e) => classify([r.id], e.target.value)} className={input + " py-0.5"} aria-label={t("bankTx.colClassification")}>
          {CLASSES.map((c) => <option key={c} value={c}>{t(`bankClass.${c}`)}</option>)}
        </select>
        {r.classification === "income" && (
          <select value={r.incomeType ?? "other"} onChange={(e) => classify([r.id], "income", { incomeType: e.target.value })} className={input + " py-0.5"} aria-label={t("bankTx.incomeType")}>
            {INCOME.map((c) => <option key={c} value={c}>{t(`bankIncome.${c}`)}</option>)}
          </select>
        )}
        {r.classification === "private" && (
          <select value={r.personAuthorId ?? ""} onChange={(e) => classify([r.id], "private", { personAuthorId: e.target.value || null })} className={input + " py-0.5"} aria-label={t("bankTx.colPerson")}>
            <option value="">{t("bankTx.pickPerson")}</option>
            {data?.authors.map((a) => <option key={a.id} value={a.id}>{a.canonicalName}</option>)}
          </select>
        )}
      </div>
    ),
    pairing: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.reimbursementOf && <a href={`/events/${id}/bank/pairing?tx=${r.id}`} className="rounded-full bg-pine-bg px-2 py-0.5 text-[11.5px] text-pine">{t("bankTx.reimbursement", { name: r.reimbursementOf })}</a>}
        {r.matches.map((m) =>
          m.confirmedAt ? (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-pine-bg px-2 py-0.5 text-[11.5px] text-pine">
              <a href={`/events/${id}/bills/${m.bill.id}`} className="hover:underline">{m.bill.merchantName ?? m.bill.originalFilename} · {kc(m.amountCzk)}</a>
              <button type="button" onClick={() => unpair(m)} aria-label={t("bankTx.unpair")} className="hover:text-red-600">✕</button>
            </span>
          ) : (
            <span key={m.id} title={m.reasons.map((x) => reasonText(x, t)).join(", ")} className={"inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11.5px] " + (m.tier === "sure" ? "border-pine text-pine" : "border-amber-500 text-amber-700")}>
              <a href={`/events/${id}/bills/${m.bill.id}`} className="hover:underline">{t(`bankTier.${m.tier}`)}: {m.bill.merchantName ?? m.bill.originalFilename} · {kc(m.amountCzk)}</a>
              <button type="button" onClick={() => act({ action: "confirm", ids: [r.id] })} aria-label={t("bankTx.confirmOne")} className="font-semibold hover:text-pine">✓</button>
              <button type="button" onClick={() => act({ action: "reject", ids: [r.id], matchIds: [m.id] })} aria-label={t("bankTx.rejectOne")} className="hover:text-red-600">✕</button>
            </span>
          )
        )}
        {r.amount < 0 && !r.matches.some((m) => m.confirmedAt) && <a href={`/events/${id}/bank/pairing?tx=${r.id}`} className="text-[11.5px] text-ember hover:underline">{t("bankTx.pair")}</a>}
        {r.noDocumentNeeded && r.classification === "expense" && <span className="text-[11.5px] text-ink-secondary">{t("bankTx.noDoc")}</span>}
      </div>
    ),
    person: (r) => r.person ?? "",
    note: (r) => (
      <input defaultValue={r.userNote ?? ""} onBlur={(e) => e.target.value !== (r.userNote ?? "") && act({ action: "note", ids: [r.id], userNote: e.target.value }, false)} className={input + " w-36 py-0.5"} aria-label={t("bankTx.colNote")} />
    ),
  };
  const totalsLine = (x: { income: number; expense: number; count: number }) => t("bankTx.totals", { income: kc(x.income), expense: kc(x.expense), saldo: kc(x.income + x.expense), count: String(x.count), noun: t(`bankPlural.tx.${pluralForm(x.count)}`) });

  return (
    <div className="mx-auto max-w-[1400px] p-4 pb-0 md:p-8 md:pb-0">
      <BankHeader title={t("bankNav.transactions")}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={async () => { const r = await act({ action: "suggest" }); setMsg(t("bankTx.suggested", { count: String(r.suggested ?? 0), sure: String(r.sure ?? 0) })); }}>{t("bankTx.runSuggest")}</button>
          <ColumnPicker
            options={COLUMNS.map((c) => ({ key: c, label: t(`bankTx.col${c[0].toUpperCase()}${c.slice(1)}`) }))}
            shown={columns}
            required={REQUIRED}
            labels={{ button: t("billsPage.columnsButton"), title: t("billsPage.columnsPickerTitle"), dragHint: t("participantsPage.columnsDragHint"), notShown: t("participantsPage.columnsNotShown"), reset: t("billsPage.columnsReset") }}
            onSave={async (keys) => save({ bankColumns: { ...prefs.bankColumns, [id]: keys } })}
            onReset={async () => { const next = { ...prefs.bankColumns }; delete next[id]; save({ bankColumns: next }); }}
          />
        </div>
      </BankHeader>

      <div className="mb-3 flex flex-wrap gap-1 border-b border-mist">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => (setTab(k), setTier(null), setSelected(new Set()), setFocus(0))} className={"-mb-px border-b-2 px-3 py-2 text-[13px] " + (tab === k ? "border-ember font-medium text-ink" : "border-transparent text-ink-secondary hover:text-ink")}>
            {t(`bankTab.${k}`)} <span className="text-ink-secondary">({data?.counts[k] ?? "…"})</span>
          </button>
        ))}
      </div>
      {tab === "suggested" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          {[null, "sure", "possible"].map((x) => (
            <button key={String(x)} type="button" onClick={() => setTier(x)} className={"rounded-full px-2.5 py-0.5 " + (tier === x ? "bg-ember text-white" : "bg-paper-2 text-ink-secondary")}>
              {x ? `${t(`bankTier.${x}`)} (${data?.counts[x] ?? 0})` : t("bankTx.allSuggestions")}
            </button>
          ))}
          <button type="button" className={btn + " ml-auto"} onClick={() => confirmSuggestions(null)}>{t("bankTx.confirmAllSure")}</button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2 text-[12px] text-ink-secondary">
        <label>{t("bankTx.from")}<input type="date" value={f.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} className={input + " block"} /></label>
        <label>{t("bankTx.to")}<input type="date" value={f.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} className={input + " block"} /></label>
        <label>{t("bankTx.direction")}<select value={f.dir ?? ""} onChange={(e) => setFilter("dir", e.target.value)} className={input + " block"}><option value="">{t("bankTx.any")}</option><option value="in">{t("bankTx.dirIn")}</option><option value="out">{t("bankTx.dirOut")}</option></select></label>
        <label>{t("bankTx.min")}<input inputMode="decimal" value={f.min ?? ""} onChange={(e) => setFilter("min", e.target.value)} className={input + " block w-24"} /></label>
        <label>{t("bankTx.max")}<input inputMode="decimal" value={f.max ?? ""} onChange={(e) => setFilter("max", e.target.value)} className={input + " block w-24"} /></label>
        <label>{t("bankTx.colClassification")}<select value={f.cls ?? ""} onChange={(e) => setFilter("cls", e.target.value)} className={input + " block"}><option value="">{t("bankTx.any")}</option>{CLASSES.map((c) => <option key={c} value={c}>{t(`bankClass.${c}`)}</option>)}</select></label>
        <label>{t("bankTx.pairState")}<select value={f.pair ?? ""} onChange={(e) => setFilter("pair", e.target.value)} className={input + " block"}><option value="">{t("bankTx.any")}</option>{["paired", "suggested", "unpaired"].map((c) => <option key={c} value={c}>{t(`bankPair.${c}`)}</option>)}</select></label>
        <label>{t("bankTx.colCounterparty")}<input value={f.counterparty ?? ""} onChange={(e) => setFilter("counterparty", e.target.value)} className={input + " block w-32"} /></label>
        <label>{t("bankTx.colPerson")}<select value={f.person ?? ""} onChange={(e) => setFilter("person", e.target.value)} className={input + " block"}><option value="">{t("bankTx.any")}</option>{data?.authors.map((a) => <option key={a.id} value={a.id}>{a.canonicalName}</option>)}</select></label>
        <label>{t("bankTx.search")}<input value={f.q ?? ""} onChange={(e) => setFilter("q", e.target.value)} className={input + " block w-40"} /></label>
        <label>{t("bankTx.groupBy")}<select value={group} onChange={(e) => setGroup(e.target.value)} className={input + " block"}><option value="">{t("bankTx.groupNone")}</option>{["classification", "pair", "counterparty", "person", "month"].map((g) => <option key={g} value={g}>{t(`bankGroup.${g}`)}</option>)}</select></label>
      </div>
      <p className="mb-2 text-[11.5px] text-ink-secondary">{t("bankTx.keysHint")}</p>
      {msg && <p className="mb-2 text-[13px] text-ink">{msg}</p>}

      {data?.groups && (
        <table className="mb-4 w-full max-w-2xl border-collapse text-[13px]">
          <thead><tr className="border-b border-mist text-left text-ink-secondary"><th className="p-1.5 font-medium">{t(`bankGroup.${group}`)}</th><th className="p-1.5 text-right font-medium">{t("bankTx.income")}</th><th className="p-1.5 text-right font-medium">{t("bankTx.expense")}</th><th className="p-1.5 text-right font-medium">{t("bankTx.saldo")}</th><th className="p-1.5 text-right font-medium">{t("bankTx.count")}</th></tr></thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={String(g.key)} className="border-b border-mist/60">
                <td className="p-1.5">{g.key === null ? "—" : group === "classification" ? t(`bankClass.${g.key}`) : group === "pair" ? t(`bankPair.${g.key}`) : g.label}</td>
                <td className="p-1.5 text-right tabular-nums text-pine">{kc(g.income)}</td><td className="p-1.5 text-right tabular-nums">{kc(g.expense)}</td><td className="p-1.5 text-right tabular-nums">{kc(g.income + g.expense)}</td><td className="p-1.5 text-right">{g.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!data ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("bankTx.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-mist text-left text-ink-secondary">
                <th className="w-8 p-1.5"><input type="checkbox" aria-label={t("bankTx.selectAll")} checked={sel.length === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                {columns.map((c) => <th key={c} className={"p-1.5 font-medium " + (c === "amount" ? "text-right" : "")}>{t(`bankTx.col${c[0].toUpperCase()}${c.slice(1)}`)}</th>)}
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {rows.map((r, i) => (
                <tr key={r.id} data-row={i} onClick={() => setFocus(i)} className={"border-b border-mist/60 align-top " + (i === focus ? "bg-paper-2 outline outline-1 -outline-offset-1 outline-ember/50" : "")}>
                  <td className="p-1.5"><input type="checkbox" checked={selected.has(r.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label={t("bankTx.select")} /></td>
                  {columns.filter(show).map((c) => <td key={c} className={"p-1.5 " + (c === "amount" ? "text-right" : "")}>{cell[c](r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {data.truncated && <p className="mt-2 text-[12px] text-amber-700">{t("bankTx.truncated")}</p>}
        </div>
      )}

      {/* Totals of the filtered rows, always visible; the selection bar above it. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-mist bg-paper-2 px-4 py-2 text-[13px] md:-mx-8 md:px-8">
        {sel.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{t("bankTx.selection")} {totalsLine(sum(sel))}</span>
            <select defaultValue="" onChange={(e) => { if (e.target.value) bulk("classify", { classification: e.target.value }); e.target.value = ""; }} className={input}>
              <option value="">{t("bankTx.classifyAs")}</option>
              {CLASSES.map((c) => <option key={c} value={c}>{t(`bankClass.${c}`)}</option>)}
            </select>
            <button type="button" className={btn} onClick={() => confirmSuggestions([...selected])}>{t("bankTx.confirmSuggestions")}</button>
            <button type="button" className={btn} onClick={() => bulk("reject")}>{t("bankTx.rejectSuggestions")}</button>
            <button type="button" className={btn} onClick={() => bulk("createBills")}>{t("bankTx.createBills")}</button>
            <button type="button" className={btn} onClick={() => bulk("createBills", { fromStatement: true })}>{t("bankTx.fromStatement")}</button>
            <button type="button" className={btn} onClick={() => bulk("noDoc", { value: true })}>{t("bankTx.noDocAction")}</button>
            {events.length > 0 && (
              <select defaultValue="" onChange={(e) => { if (e.target.value) bulk("move", { targetEventId: e.target.value }); e.target.value = ""; }} className={input}>
                <option value="">{t("bankTx.moveTo")}</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
          </div>
        )}
        {data && <span className="text-ink-secondary">{t("bankTx.shown")} {totalsLine(data.totals)}</span>}
      </div>
    </div>
  );
}
