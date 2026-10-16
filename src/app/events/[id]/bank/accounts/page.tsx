"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import BankHeader, { syncErrorKey } from "@/components/bank/BankHeader";
import ColumnMappingTable from "@/components/import/ColumnMappingTable";
import { BANK_FIELDS } from "@/lib/bank/fields";

// Banka -> Účty a import: the event's accounts (window, source, Fio token, sync) and the import
// with preview (docs/bank-reconciliation.md A3).
type Account = {
  id: string; label: string; accountNumber: string; bankCode: string; sourceType: "fio_api" | "sheet" | "file";
  tokenSaved: boolean; sheetId: string | null; sheetRange: string | null; lastSyncAt: string | null; lastError: string | null;
  lastSyncResult: { counts?: Record<string, number>; error?: string } | null;
};
type Link = { dateFrom: string; dateTo: string; account: Account };
type Counts = { new: number; duplicate: number; outside: number; error: number };
type Row = { line: number; status: keyof Counts; reason?: string; date?: string; amount?: number; counterparty?: string | null; message?: string | null; raw?: string };
type Preview = { headerRow: number; headers: string[]; mapping: string[]; problems: string[]; window: { from: string; to: string }; top: string[][]; counts: Counts | null; rows: Row[]; errors?: Row[]; sheet: { spreadsheetId: string; tab: string; tabs: string[] } | null };

const inputClass = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[14px] text-ink";
const btn = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const tabClass = (on: boolean) => "border-b-2 px-3 py-2 text-[13px] font-medium " + (on ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink");
const kc = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (s: string) => new Date(s).toLocaleDateString("cs-CZ", { timeZone: "UTC" });

export default function BankAccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<{ links: Link[]; available: { id: string; label: string; accountNumber: string; bankCode: string }[]; eventDates: { from: string; to: string } } | null>(null);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ existing: "", label: "", accountNumber: "", bankCode: "2010", sourceType: "fio_api" });

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/${id}/bank/accounts`);
    if (r.status === 403) return setDenied(true);
    if (r.ok) setData(await r.json());
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  const say = (accountId: string, text: string) => setMsg((m) => ({ ...m, [accountId]: text }));
  const countsText = (c?: Partial<Counts>) => (c ? t("bankImport.counts", { new: String(c.new ?? 0), duplicate: String(c.duplicate ?? 0), outside: String(c.outside ?? 0), error: String(c.error ?? 0) }) : "");

  async function call(accountId: string, path: string, method = "POST", body?: object) {
    setBusy(accountId + path);
    const r = await fetch(`/api/events/${id}/bank/accounts/${accountId}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(null);
    return r ? await r.json().catch(() => ({})) : { status: "unreachable" };
  }
  async function sync(a: Account) {
    const r = await call(a.id, "/sync");
    say(a.id, r.error ? t(syncErrorKey(r.error)) : `${t("bankImport.synced")} ${countsText(r.counts)}`);
    load();
  }
  async function test(a: Account) {
    const r = await call(a.id, "/test");
    say(a.id, r.status === "ok" ? t("bankAccountsPage.testOk", { account: r.accountNumber ?? "", count: String(r.count), day: date(r.day) }) : t(syncErrorKey(r.status)));
  }
  async function saveToken(a: Account) {
    const r = await call(a.id, "/token", "PUT", { token: token[a.id] ?? "" });
    say(a.id, r.status === "saved" ? t("bankAccountsPage.tokenSaved") : t(`bankAccountsPage.token.${r.status}`));
    setToken((x) => ({ ...x, [a.id]: "" }));
    load();
  }
  async function unlink(a: Account) {
    if (!(await confirm({ message: t("bankAccountsPage.unlinkConfirm", { name: a.label }), danger: true }))) return;
    await call(a.id, "", "DELETE");
    load();
  }
  async function add() {
    const r = await fetch(`/api/events/${id}/bank/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.existing ? { bankAccountId: form.existing } : form),
    }).catch(() => null);
    if (!r?.ok) return say("add", t(`bankAccountsPage.error.${((await r?.json().catch(() => ({}))) as { error?: string })?.error ?? "failed"}`));
    setAdding(false);
    say("add", "");
    load();
  }

  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("bank.noAccess")}</div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <BankHeader title={t("bankNav.accounts")}>
        <button type="button" className={btnPrimary} onClick={() => setAdding(!adding)}>{t("bankAccountsPage.add")}</button>
      </BankHeader>

      {adding && (
        <div className="mb-5 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-4 text-[13px]">
          {data.available.length > 0 && (
            <label className="text-ink-secondary">
              {t("bankAccountsPage.linkExisting")}
              <select value={form.existing} onChange={(e) => setForm({ ...form, existing: e.target.value })} className={inputClass + " mt-1 block"}>
                <option value="">{t("bankAccountsPage.newAccount")}</option>
                {data.available.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.accountNumber}/{a.bankCode}</option>)}
              </select>
            </label>
          )}
          {!form.existing && (
            <div className="flex flex-wrap gap-2">
              <input placeholder={t("bankAccountsPage.label")} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} />
              <input placeholder={t("bankAccountsPage.number")} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className={inputClass + " w-40"} />
              <input placeholder={t("bankAccountsPage.bankCode")} value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} className={inputClass + " w-20"} />
              <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })} className={inputClass}>
                {["fio_api", "sheet", "file"].map((s) => <option key={s} value={s}>{t(`bankSource.${s}`)}</option>)}
              </select>
            </div>
          )}
          <p className="text-[12px] text-ink-secondary">{t("bankAccountsPage.windowHint", { from: date(data.eventDates.from), to: date(data.eventDates.to) })}</p>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={add}>{t("bankAccountsPage.addConfirm")}</button>
            <button type="button" className={btn} onClick={() => setAdding(false)}>{t("common.cancel")}</button>
          </div>
          {msg.add && <p className="text-red-600">{msg.add}</p>}
        </div>
      )}

      {data.links.length === 0 && <p className="mb-6 text-[14px] text-ink-secondary">{t("bankAccountsPage.empty")}</p>}
      <div className="mb-8 flex flex-col gap-3">
        {data.links.map(({ account: a, dateFrom, dateTo }) => (
          <div key={a.id} className="rounded-lg border border-mist p-4 text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-[15px] font-semibold text-ink">{a.label}</span>{" "}
                <span className="text-ink-secondary">{a.accountNumber}/{a.bankCode} · {t(`bankSource.${a.sourceType}`)}</span>
              </div>
              <button type="button" className="text-ink-secondary hover:text-red-600" onClick={() => unlink(a)}>{t("bankAccountsPage.unlink")}</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-ink-secondary">
              {t("bankAccountsPage.window")}
              <input type="date" defaultValue={dateFrom} onBlur={(e) => e.target.value !== dateFrom && call(a.id, "", "PATCH", { dateFrom: e.target.value }).then(load)} className={inputClass + " py-1"} />
              –
              <input type="date" defaultValue={dateTo} onBlur={(e) => e.target.value !== dateTo && call(a.id, "", "PATCH", { dateTo: e.target.value }).then(load)} className={inputClass + " py-1"} />
            </div>
            <p className="mt-1 text-ink-secondary">
              {a.lastSyncAt ? t("bankAccountsPage.lastSync", { at: new Date(a.lastSyncAt).toLocaleString("cs-CZ") }) : t("bankAccountsPage.neverSynced")}{" "}
              {a.lastSyncResult?.counts && countsText(a.lastSyncResult.counts)}
              {a.lastError && <span className="text-amber-700"> · {t(syncErrorKey(a.lastError))}</span>}
            </p>
            {a.sourceType === "fio_api" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-ink-secondary">{t("bankAccountsPage.token")}</span>
                {a.tokenSaved && !token[a.id] && <span className="text-pine">{t("bankAccountsPage.tokenOk")}</span>}
                <input type="password" autoComplete="off" placeholder={a.tokenSaved ? t("bankAccountsPage.tokenChange") : t("bankAccountsPage.tokenPlaceholder")} value={token[a.id] ?? ""} onChange={(e) => setToken({ ...token, [a.id]: e.target.value })} className={inputClass + " w-64 py-1"} />
                {!!token[a.id] && <button type="button" className={btn} onClick={() => saveToken(a)}>{t("common.save")}</button>}
                <button type="button" className={btn} disabled={!a.tokenSaved || !!busy} onClick={() => test(a)}>{t("bankAccountsPage.test")}</button>
                <button type="button" className={btnPrimary} disabled={!a.tokenSaved || !!busy} onClick={() => sync(a)}>{busy === a.id + "/sync" ? t("bankImport.syncing") : t("bankImport.sync")}</button>
              </div>
            )}
            {a.sourceType === "sheet" && a.sheetId && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-ink-secondary">{t("bankAccountsPage.sheet", { tab: a.sheetRange ?? "" })}</span>
                <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => sync(a)}>{busy === a.id + "/sync" ? t("bankImport.syncing") : t("bankImport.sync")}</button>
              </div>
            )}
            {a.sourceType === "fio_api" && <p className="mt-1 text-[12px] text-ink-secondary">{t("bankAccountsPage.fioHint")}</p>}
            {msg[a.id] && <p className="mt-2 text-ink">{msg[a.id]}</p>}
          </div>
        ))}
      </div>

      {data.links.length > 0 && <ImportPanel eventId={id} links={data.links} onDone={load} t={t} countsText={countsText} />}
    </div>
  );
}

function ImportPanel({ eventId, links, onDone, t, countsText }: { eventId: string; links: Link[]; onDone: () => void; t: (k: string, v?: Record<string, string>) => string; countsText: (c?: Partial<Counts>) => string }) {
  const [accountId, setAccountId] = useState(links[0].account.id);
  const [source, setSource] = useState<"file" | "paste" | "sheet">("file");
  const [payload, setPayload] = useState<{ base64?: string; text?: string; fileName?: string; spreadsheetId?: string; tab?: string }>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<string[] | null>(null);
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [result, setResult] = useState<{ counts: Counts; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(commit: boolean, override: { mapping?: string[] | null; headerRow?: number | null; payload?: typeof payload } = {}) {
    setBusy(true);
    setError(null);
    const m = override.mapping !== undefined ? override.mapping : mapping;
    const h = override.headerRow !== undefined ? override.headerRow : headerRow;
    const r = await fetch(`/api/events/${eventId}/bank/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, source, ...(override.payload ?? payload), ...(m && { mapping: m }), ...(h !== null && { headerRow: h }), commit }),
    }).catch(() => null);
    setBusy(false);
    const body = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setError(t(`bankImport.error.${body.error ?? "failed"}`));
    if (commit) {
      const batch = await fetch(`/api/events/${eventId}/bank/batches/${body.batchId}`).then((x) => x.json());
      setResult({ counts: batch.counts, rows: batch.rows });
      setPreview(null);
      onDone();
    } else {
      setPreview(body);
      setMapping(body.mapping);
      setHeaderRow(body.headerRow);
      setResult(null);
    }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const p = { base64: btoa(bin), fileName: f.name };
    setPayload(p);
    setMapping(null);
    setHeaderRow(null);
    run(false, { payload: p, mapping: null, headerRow: null });
  }
  const statusClass: Record<string, string> = { new: "text-pine", duplicate: "text-ink-secondary", outside: "text-ink-secondary", error: "text-red-600" };
  const rowTable = (rows: Row[]) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-mist text-left text-ink-secondary">
            <th className="p-1.5 font-medium">{t("bankImport.colLine")}</th><th className="p-1.5 font-medium">{t("bankImport.colStatus")}</th><th className="p-1.5 font-medium">{t("bankTx.colDate")}</th>
            <th className="p-1.5 text-right font-medium">{t("bankTx.colAmount")}</th><th className="p-1.5 font-medium">{t("bankTx.colCounterparty")}</th><th className="p-1.5 font-medium">{t("bankTx.colMessage")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className="border-b border-mist/60">
              <td className="p-1.5 text-ink-secondary">{r.line}</td>
              <td className={"p-1.5 " + statusClass[r.status]}>{t(`bankImport.status.${r.status}`)}{r.reason && ` – ${t(`bankImport.reason.${r.reason}`)}`}</td>
              <td className="p-1.5">{r.date ? date(r.date) : ""}</td>
              <td className={"p-1.5 text-right tabular-nums " + ((r.amount ?? 0) < 0 ? "text-ink" : "text-pine")}>{r.amount !== undefined ? kc(r.amount) : ""}</td>
              <td className="p-1.5">{r.counterparty ?? ""}</td>
              <td className="p-1.5 text-ink-secondary [overflow-wrap:anywhere]">{r.message ?? r.raw ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section>
      <h2 className="mb-2 text-[17px] font-semibold text-ink">{t("bankImport.title")}</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <select value={accountId} onChange={(e) => (setAccountId(e.target.value), setPreview(null))} className={inputClass}>
          {links.map((l) => <option key={l.account.id} value={l.account.id}>{l.account.label} · {l.account.accountNumber}/{l.account.bankCode}</option>)}
        </select>
      </div>
      <div className="mb-3 flex gap-1 border-b border-mist">
        {(["file", "paste", "sheet"] as const).map((s) => (
          <button key={s} type="button" className={tabClass(source === s)} onClick={() => (setSource(s), setPreview(null), setPayload({}), setResult(null))}>{t(`bankImport.source.${s}`)}</button>
        ))}
      </div>
      {source === "file" && <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-[13px]" />}
      {source === "paste" && (
        <div className="flex flex-col gap-2">
          <textarea rows={6} value={payload.text ?? ""} onChange={(e) => setPayload({ text: e.target.value })} placeholder={t("planImport.pastePlaceholder")} className={inputClass + " font-mono text-[12.5px]"} />
          <button type="button" className={btn + " self-start"} disabled={!payload.text?.trim() || busy} onClick={() => (setMapping(null), setHeaderRow(null), run(false, { mapping: null, headerRow: null }))}>{t("bankImport.check")}</button>
        </div>
      )}
      {source === "sheet" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input value={payload.spreadsheetId ?? ""} onChange={(e) => setPayload({ ...payload, spreadsheetId: e.target.value })} placeholder={t("planImport.sheetPlaceholder")} className={inputClass + " flex-1"} />
            <button type="button" className={btn} disabled={!payload.spreadsheetId?.trim() || busy} onClick={() => (setMapping(null), setHeaderRow(null), run(false, { mapping: null, headerRow: null }))}>{t("planImport.loadSheet")}</button>
          </div>
          {preview?.sheet && preview.sheet.tabs.length > 1 && (
            <select value={preview.sheet.tab} onChange={(e) => { const p = { ...payload, tab: e.target.value }; setPayload(p); run(false, { payload: p, mapping: null, headerRow: null }); }} className={inputClass + " self-start"}>
              {preview.sheet.tabs.map((tab) => <option key={tab}>{tab}</option>)}
            </select>
          )}
          <p className="text-[12px] text-ink-secondary">{t("billImport.shareHint")}</p>
        </div>
      )}
      {busy && <p className="mt-2 text-[13px] text-ink-secondary">{t("common.loading")}</p>}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      {preview && (
        <div className="mt-4">
          <label className="mb-2 flex items-center gap-2 text-[13px] text-ink-secondary">
            {t("bankImport.headerRow")}
            <select value={preview.headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); run(false, { headerRow: h, mapping: null }); }} className={inputClass + " max-w-md py-1"}>
              {preview.top.map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 70)}</option>)}
            </select>
          </label>
          <ColumnMappingTable
            headers={preview.headers}
            rows={preview.top.slice(preview.headerRow + 1)}
            mapping={mapping ?? preview.mapping}
            fields={BANK_FIELDS}
            label={(f) => t(`bankField.${f.key}`) + (f.required ? " *" : "")}
            onChange={(i, key) => {
              const next = (mapping ?? preview.mapping).map((m, j) => (j === i ? key : key && m === key ? "" : m));
              setMapping(next);
              run(false, { mapping: next });
            }}
            t={t}
          />
          {preview.problems.length > 0 && <p className="mt-2 text-[13px] text-red-600">{preview.problems.map((p) => t(`bankImport.problem.${p}`)).join(" ")}</p>}
          {preview.counts && (
            <>
              <p className="mt-3 text-[13px] text-ink">{countsText(preview.counts)} · {t("bankImport.window", { from: date(preview.window.from), to: date(preview.window.to) })}</p>
              <h3 className="mb-1 mt-3 text-[14px] font-semibold text-ink">{t("bankImport.previewRows")}</h3>
              {rowTable(preview.rows)}
              {!!preview.errors?.length && (
                <>
                  <h3 className="mb-1 text-[14px] font-semibold text-red-600">{t("bankImport.errorRows")}</h3>
                  {rowTable(preview.errors)}
                </>
              )}
              <button type="button" className={btnPrimary} disabled={busy || preview.counts.new === 0} onClick={() => run(true)}>{t("bankImport.confirm", { count: String(preview.counts.new) })}</button>
            </>
          )}
        </div>
      )}
      {result && (
        <div className="mt-4">
          <p className="mb-2 text-[14px] font-medium text-ink">{t("bankImport.done")} {countsText(result.counts)}</p>
          {rowTable(result.rows)}
        </div>
      )}
    </section>
  );
}
