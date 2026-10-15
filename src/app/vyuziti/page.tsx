"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import BarChart from "@/components/usage/BarChart";
import { storageCostUsd, type GcpPrices } from "@/lib/gcp-prices";

// Využití (super-admin): Aktivita / Náklady / Ceny GCP. Drill-down state lives in the URL
// (?tab=&org=&event=&user=&days=), so the event card in Nastavení akce can link straight in.
type T = (key: string, vars?: Record<string, string>) => string;

const th = "p-2 text-left text-[12px] font-medium text-ink-secondary";
const td = "p-2 text-[13px] text-ink";
const tdNum = "p-2 text-right text-[13px] tabular-nums text-ink";
const inputClass = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink";
const linkBtn = "text-left text-ember hover:underline";
const usd = (n: number) => `$${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2 })}`;
const gb = (bytes: number) => `${(bytes / 2 ** 30).toLocaleString("cs-CZ", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} GB`;
const num = (n: number) => n.toLocaleString("cs-CZ");
const date = (d: string | null) => (d ? new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" }) : "—");

function useQuery() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = (k: string) => sp.get(k) ?? "";
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [sp, router, pathname]
  );
  return { q, set, qs: sp.toString() };
}

function useJson<D>(url: string | null) {
  const [data, setData] = useState<D | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && (setData(d), setError(false)))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [url]);
  return { data, error };
}

function Table({ head, children, right = [] }: { head: string[]; children: React.ReactNode; right?: number[] }) {
  return (
    <div className="mb-6 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-mist">
            {head.map((h, i) => (
              <th key={h + i} className={th + (right.includes(i) ? " text-right" : "")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Row = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => <tr className={"border-b border-mist/60" + (strong ? " font-semibold" : "")}>{children}</tr>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 mt-2 text-[16px] font-semibold text-ink">{children}</h2>;

function Period({ t }: { t: T }) {
  const { q, set } = useQuery();
  return (
    <select value={q("days") || "30"} onChange={(e) => set({ days: e.target.value })} className={inputClass} aria-label={t("usage.period")}>
      {["7", "30", "90", "365", "0"].map((d) => (
        <option key={d} value={d}>{t(`usage.period.${d}`)}</option>
      ))}
    </select>
  );
}

// ---- Aktivita ----
type ActivityData = {
  orgs: { id: string; name: string; active7: number; activeP: number; viewsP: number; actionsP: number; last: string | null }[];
  users: { id: string; name: string; email: string; org: string; isSuperAdmin: boolean; last: string | null; views7: number; viewsP: number; actionsP: number; topModule: string | null }[];
  pages: { route: string; views: number; users: number }[];
  events: { id: string; name: string }[];
};
type UserData = {
  user: { displayName: string; email: string; organization: { name: string } };
  daily: { day: string; views: number }[];
  routes: { route: string; views: number }[];
  events: { id: string; name: string; org: string; views: number; last: string }[];
};

function Activity({ t }: { t: T }) {
  const { q, set } = useQuery();
  const params = new URLSearchParams({ days: q("days") || "30", org: q("org"), event: q("event"), withSuper: q("withSuper") });
  const list = useJson<ActivityData>(q("user") ? null : `/api/usage/activity?${params}`);
  const user = useJson<UserData>(q("user") ? `/api/usage/activity?${params}&user=${q("user")}` : null);
  const [now] = useState(() => Date.now());

  if (q("user")) {
    const d = user.data;
    // Every day of the last 90, zeros included, so gaps read as gaps.
    const byDay = new Map(d?.daily.map((x) => [x.day, x.views]));
    const days = Array.from({ length: 90 }, (_, i) => new Date(now - (89 - i) * 864e5).toISOString().slice(0, 10));
    return (
      <div>
        <button type="button" onClick={() => set({ user: null })} className={linkBtn + " mb-3 text-[13px]"}>← {t("usage.backToUsers")}</button>
        {!d ? (
          <p className="text-[13px] text-ink-secondary">{user.error ? t("usage.loadFailed") : t("common.loading")}</p>
        ) : (
          <>
            <H2>{d.user.displayName} · <span className="font-normal text-ink-secondary">{d.user.email} · {d.user.organization.name}</span></H2>
            <BarChart label={t("usage.dailyViews90")} data={days.map((x) => ({ x: x.slice(5).split("-").reverse().join(". ") + ".", y: byDay.get(x) ?? 0 }))} format={num} />
            <H2>{t("usage.topRoutes")}</H2>
            <Table head={[t("usage.route"), t("usage.views")]} right={[1]}>
              {d.routes.map((r) => (
                <Row key={r.route}><td className={td + " font-mono text-[12px]"}>{r.route}</td><td className={tdNum}>{num(r.views)}</td></Row>
              ))}
            </Table>
            <H2>{t("usage.eventsVisited")}</H2>
            <Table head={[t("usage.event"), t("usage.organization"), t("usage.views"), t("usage.lastActive")]} right={[2]}>
              {d.events.map((e) => (
                <Row key={e.id}><td className={td}>{e.name}</td><td className={td}>{e.org}</td><td className={tdNum}>{num(e.views)}</td><td className={td}>{date(e.last)}</td></Row>
              ))}
            </Table>
          </>
        )}
      </div>
    );
  }

  const d = list.data;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={q("org")} onChange={(e) => set({ org: e.target.value || null, event: null })} className={inputClass} aria-label={t("usage.organization")}>
          <option value="">{t("usage.allOrgs")}</option>
          {d?.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {q("org") && (
          <select value={q("event")} onChange={(e) => set({ event: e.target.value || null })} className={inputClass} aria-label={t("usage.event")}>
            <option value="">{t("usage.allEvents")}</option>
            {d?.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <Period t={t} />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={q("withSuper") === "1"} onChange={(e) => set({ withSuper: e.target.checked ? "1" : null })} />
          {t("usage.withSuper")}
        </label>
      </div>
      {!d ? (
        <p className="text-[13px] text-ink-secondary">{list.error ? t("usage.loadFailed") : t("common.loading")}</p>
      ) : (
        <>
          {!q("org") && (
            <>
              <H2>{t("usage.organizations")}</H2>
              <Table head={[t("usage.organization"), t("usage.active7"), t("usage.activeP"), t("usage.viewsP"), t("usage.actionsP"), t("usage.lastActive")]} right={[1, 2, 3, 4]}>
                {d.orgs.map((o) => (
                  <Row key={o.id}>
                    <td className={td}><button type="button" className={linkBtn} onClick={() => set({ org: o.id })}>{o.name}</button></td>
                    <td className={tdNum}>{num(o.active7)}</td><td className={tdNum}>{num(o.activeP)}</td><td className={tdNum}>{num(o.viewsP)}</td><td className={tdNum}>{num(o.actionsP)}</td><td className={td}>{date(o.last)}</td>
                  </Row>
                ))}
              </Table>
            </>
          )}
          <H2>{t("usage.users")}</H2>
          <Table head={[t("usage.user"), t("usage.organization"), t("usage.lastActive"), t("usage.views7"), t("usage.viewsP"), t("usage.actionsP"), t("usage.topModule")]} right={[3, 4, 5]}>
            {d.users.map((u) => (
              <Row key={u.id}>
                <td className={td}><button type="button" className={linkBtn} onClick={() => set({ user: u.id })}>{u.name}</button><div className="text-[11.5px] text-ink-secondary">{u.email}</div></td>
                <td className={td}>{u.org}</td><td className={td}>{date(u.last)}</td><td className={tdNum}>{num(u.views7)}</td><td className={tdNum}>{num(u.viewsP)}</td><td className={tdNum}>{num(u.actionsP)}</td><td className={td}>{u.topModule ?? "—"}</td>
              </Row>
            ))}
          </Table>
          <H2>{t("usage.pages")}</H2>
          <Table head={[t("usage.route"), t("usage.viewsP"), t("usage.distinctUsers")]} right={[1, 2]}>
            {d.pages.map((p) => (
              <Row key={p.route}><td className={td + " font-mono text-[12px]"}>{p.route}</td><td className={tdNum}>{num(p.views)}</td><td className={tdNum}>{num(p.users)}</td></Row>
            ))}
          </Table>
          <p className="text-[12px] text-ink-secondary">{t("usage.actionsHint")}</p>
        </>
      )}
    </div>
  );
}

// ---- Náklady ----
type Storage = { key: string | null; bytes: number; files: number; unmeasured: number };
type AiRow = { id: string; name: string; events?: number; aiCost: number; aiCalls: number; bills: number; unpriced: number };
type CostData =
  | { level: "orgs"; prices: GcpPrices; ai: AiRow[]; storage: Storage[] }
  | { level: "org"; prices: GcpPrices; org: { id: string; name: string }; ai: AiRow[]; storage: Storage[]; monthly: { month: string; cost: number; calls: number }[] }
  | {
      level: "event";
      prices: GcpPrices;
      event: { id: string; name: string; organization: { id: string; name: string } };
      totals: { aiCost: number; aiCalls: number; bills: number; unpriced: number; reprocess: number; failed: number };
      byUser: { userId: string | null; name: string | null; cost: number; calls: number }[];
      byPurpose: { purpose: string; cost: number; calls: number }[];
      topBills: { billId: string; exists: boolean; label: string | null; cost: number; calls: number }[];
      monthly: { month: string; cost: number; calls: number }[];
      storageKind: Storage[];
      storageUser: (Storage & { name: string | null })[];
    };

function Costs({ t }: { t: T }) {
  const { q, set } = useQuery();
  const params = new URLSearchParams({ days: q("days") || "30", org: q("org"), event: q("event") });
  const { data: d, error } = useJson<CostData>(`/api/usage/costs?${params}`);
  const loaded = d && (q("event") ? d.level === "event" : q("org") ? d.level === "org" : d.level === "orgs");
  const sCost = (bytes: number) => (d ? storageCostUsd(d.prices, bytes) : null);
  const money = (n: number | null) => (n === null ? <span className="text-ink-secondary">{t("usage.priceNotSet")}</span> : usd(n));
  const aiCell = (r: { aiCost: number; unpriced: number }) => (
    <>
      {usd(r.aiCost)}
      {r.unpriced > 0 && <div className="text-[11px] font-normal text-amber-700">{t("usage.unpricedCalls", { count: String(r.unpriced) })}</div>}
    </>
  );
  const unmeasured = (s: Storage[]) => s.reduce((n, x) => n + x.unmeasured, 0);

  // One row of the organizations / events table; total = AI (period) + storage per month.
  const costRow = (r: AiRow, s: Storage | undefined, open: () => void) => {
    const st = sCost(s?.bytes ?? 0);
    return (
      <Row key={r.id}>
        <td className={td}><button type="button" className={linkBtn} onClick={open}>{r.name}</button></td>
        {r.events !== undefined && <td className={tdNum}>{num(r.events)}</td>}
        <td className={tdNum}>{aiCell(r)}</td><td className={tdNum}>{num(r.aiCalls)}</td><td className={tdNum}>{num(r.bills)}</td>
        <td className={tdNum}>{gb(s?.bytes ?? 0)}</td><td className={tdNum}>{money(st)}</td><td className={tdNum + " font-semibold"}>{usd(r.aiCost + (st ?? 0))}</td>
      </Row>
    );
  };
  const totalRow = (label: string, rows: AiRow[], storage: Storage[], withEvents: boolean) => {
    const ai = rows.reduce((n, r) => n + r.aiCost, 0);
    const bytes = storage.reduce((n, s) => n + s.bytes, 0);
    const st = sCost(bytes);
    return (
      <Row strong>
        <td className={td}>{label}</td>
        {withEvents && <td className={tdNum}>{num(rows.reduce((n, r) => n + (r.events ?? 0), 0))}</td>}
        <td className={tdNum}>{usd(ai)}</td><td className={tdNum}>{num(rows.reduce((n, r) => n + r.aiCalls, 0))}</td><td className={tdNum}>{num(rows.reduce((n, r) => n + r.bills, 0))}</td>
        <td className={tdNum}>{gb(bytes)}</td><td className={tdNum}>{money(st)}</td><td className={tdNum}>{usd(ai + (st ?? 0))}</td>
      </Row>
    );
  };
  const costHead = (first: string, withEvents: boolean) => [first, ...(withEvents ? [t("usage.eventsCount")] : []), t("usage.aiCost"), t("usage.aiCalls"), t("usage.billsProcessed"), t("usage.storage"), t("usage.storageMonth"), t("usage.total")];
  const monthChart = (m: { month: string; cost: number }[]) => <BarChart label={t("usage.monthlyAi")} data={m.map((x) => ({ x: x.month, y: x.cost }))} format={usd} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
        <Period t={t} />
        {(q("org") || q("event")) && (
          <nav className="flex flex-wrap gap-1 text-ink-secondary">
            <button type="button" className={linkBtn} onClick={() => set({ org: null, event: null })}>{t("usage.organizations")}</button>
            {d?.level === "event" && (
              <>
                <span>›</span>
                <button type="button" className={linkBtn} onClick={() => set({ org: d.event.organization.id, event: null })}>{d.event.organization.name}</button>
              </>
            )}
          </nav>
        )}
      </div>
      {!loaded || !d ? (
        <p className="text-[13px] text-ink-secondary">{error ? t("usage.loadFailed") : t("common.loading")}</p>
      ) : d.level === "orgs" ? (
        <>
          <Table head={costHead(t("usage.organization"), true)} right={[1, 2, 3, 4, 5, 6, 7]}>
            {d.ai.map((r) => costRow(r, d.storage.find((s) => s.key === r.id), () => set({ org: r.id })))}
            {totalRow(t("usage.grandTotal"), d.ai, d.storage, true)}
          </Table>
          {unmeasured(d.storage) > 0 && <p className="mb-2 text-[12px] text-amber-700">{t("usage.unmeasured", { count: String(unmeasured(d.storage)) })}</p>}
        </>
      ) : d.level === "org" ? (
        <>
          <H2>{d.org.name}</H2>
          {monthChart(d.monthly)}
          <Table head={costHead(t("usage.event"), false)} right={[1, 2, 3, 4, 5, 6]}>
            {d.ai.map((r) => costRow(r, d.storage.find((s) => s.key === r.id), () => set({ event: r.id })))}
            {/* Person documents: the organization's, not one event's. */}
            {d.storage.some((s) => s.key === null) && (
              <Row>
                <td className={td + " text-ink-secondary"}>{t("usage.noEventStorage")}</td>
                <td className={tdNum}>—</td><td className={tdNum}>—</td><td className={tdNum}>—</td>
                <td className={tdNum}>{gb(d.storage.find((s) => s.key === null)!.bytes)}</td><td className={tdNum}>{money(sCost(d.storage.find((s) => s.key === null)!.bytes))}</td><td className={tdNum}>{usd(sCost(d.storage.find((s) => s.key === null)!.bytes) ?? 0)}</td>
              </Row>
            )}
            {totalRow(t("eventDetail.total"), d.ai, d.storage, false)}
          </Table>
        </>
      ) : (
        <>
          <H2>{d.event.name}</H2>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t("usage.aiCost"), usd(d.totals.aiCost)],
              [t("usage.avgPerBill"), d.totals.bills ? usd(d.totals.aiCost / d.totals.bills) : "—"],
              [t("usage.aiCalls"), `${num(d.totals.aiCalls)} (${t("usage.reprocessFailed", { reprocess: num(d.totals.reprocess), failed: num(d.totals.failed) })})`],
              [t("usage.storageMonth"), (() => { const b = d.storageKind.reduce((n, s) => n + s.bytes, 0); const c = sCost(b); return `${gb(b)} · ${c === null ? t("usage.priceNotSet") : usd(c)}`; })()],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-mist bg-paper-2 p-3">
                <div className="text-[12px] text-ink-secondary">{k}</div>
                <div className="text-[15px] font-semibold text-ink">{v}</div>
              </div>
            ))}
          </div>
          {d.totals.unpriced > 0 && <p className="mb-3 text-[12px] text-amber-700">{t("usage.unpricedCalls", { count: String(d.totals.unpriced) })}</p>}
          {monthChart(d.monthly)}
          <div className="grid gap-x-6 md:grid-cols-2">
            <div>
              <H2>{t("usage.byUser")}</H2>
              <Table head={[t("usage.user"), t("usage.aiCost"), t("usage.aiCalls")]} right={[1, 2]}>
                {d.byUser.map((u) => (
                  <Row key={u.userId ?? "auto"}><td className={td}>{u.name ?? t("usage.automatic")}</td><td className={tdNum}>{usd(u.cost)}</td><td className={tdNum}>{num(u.calls)}</td></Row>
                ))}
              </Table>
            </div>
            <div>
              <H2>{t("usage.byPurpose")}</H2>
              <Table head={[t("usage.purpose"), t("usage.aiCost"), t("usage.aiCalls")]} right={[1, 2]}>
                {d.byPurpose.map((p) => (
                  <Row key={p.purpose}><td className={td}>{t(`usage.purpose.${p.purpose}`)}</td><td className={tdNum}>{usd(p.cost)}</td><td className={tdNum}>{num(p.calls)}</td></Row>
                ))}
              </Table>
            </div>
          </div>
          <H2>{t("usage.topBills")}</H2>
          <Table head={[t("usage.bill"), t("usage.aiCost"), t("usage.aiCalls")]} right={[1, 2]}>
            {d.topBills.map((b) => (
              <Row key={b.billId}>
                <td className={td}>{b.exists ? <a className={linkBtn} href={`/events/${d.event.id}/bills/${b.billId}`}>{b.label ?? b.billId}</a> : <span className="text-ink-secondary">{t("usage.billGone")}</span>}</td>
                <td className={tdNum}>{usd(b.cost)}</td><td className={tdNum}>{num(b.calls)}</td>
              </Row>
            ))}
          </Table>
          <div className="grid gap-x-6 md:grid-cols-2">
            {([["usage.storageByKind", d.storageKind.map((s) => ({ ...s, label: t(`usage.kind.${s.key}`) }))], ["usage.storageByUploader", d.storageUser.map((s) => ({ ...s, label: s.name ?? t("usage.uploaderNone") }))]] as const).map(([title, rows]) => (
              <div key={title}>
                <H2>{t(title)}</H2>
                <Table head={["", t("usage.files"), t("usage.storage")]} right={[1, 2]}>
                  {rows.map((s) => (
                    <Row key={(s.key ?? "none") + s.label}><td className={td}>{s.label}</td><td className={tdNum}>{num(s.files)}</td><td className={tdNum}>{gb(s.bytes)}</td></Row>
                  ))}
                </Table>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-2 text-[12px] text-ink-secondary">{t("usage.estimateNote")} {t("usage.totalNote")}</p>
    </div>
  );
}

// ---- Ceny GCP ----
function Prices({ t }: { t: T }) {
  const { data } = useJson<{ prices: GcpPrices; models: string[] }>("/api/usage/prices");
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const f: Record<string, string> = { gcs: data.prices.gcsGbMonth?.toString() ?? "" };
    for (const m of data.models) {
      f[`${m}|input`] = data.prices.models[m]?.input?.toString() ?? "";
      f[`${m}|output`] = data.prices.models[m]?.output?.toString() ?? "";
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the form starts from the loaded prices
    setForm(f);
  }, [data]);
  if (!data) return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  const val = (k: string) => (form[k]?.trim() ? Number(form[k].replace(",", ".")) : null);
  async function save() {
    setMsg(null);
    const body: GcpPrices = { gcsGbMonth: val("gcs"), models: Object.fromEntries(data!.models.map((m) => [m, { input: val(`${m}|input`), output: val(`${m}|output`) }])) };
    const res = await fetch("/api/usage/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMsg(res?.ok ? t("usage.pricesSaved") : t("usage.pricesInvalid"));
  }
  const field = (k: string, label: string) => (
    <label className="text-[12px] text-ink-secondary">
      {label}
      <input inputMode="decimal" value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass + " mt-1 block w-28"} />
    </label>
  );
  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[13px] text-ink-secondary">
        {t("usage.pricesHint")}{" "}
        <a className={linkBtn} href="https://cloud.google.com/vertex-ai/generative-ai/pricing" target="_blank" rel="noreferrer">Vertex AI</a>
        {" · "}
        <a className={linkBtn} href="https://cloud.google.com/storage/pricing" target="_blank" rel="noreferrer">Cloud Storage</a>
      </p>
      {data.models.map((m) => (
        <Fragment key={m}>
          <p className="mb-1 font-mono text-[13px] text-ink">{m}</p>
          <div className="mb-4 flex gap-3">{field(`${m}|input`, t("usage.priceInput"))}{field(`${m}|output`, t("usage.priceOutput"))}</div>
        </Fragment>
      ))}
      <div className="mb-4">{field("gcs", t("usage.priceGcs"))}</div>
      <button type="button" onClick={save} className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover">{t("common.save")}</button>
      {msg && <p className="mt-2 text-[13px] text-ink">{msg}</p>}
    </div>
  );
}

function UsagePage() {
  const { t, isSuperAdmin, roleLoaded } = useTranslations();
  const { q, set } = useQuery();
  if (roleLoaded && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("orgs.superAdminOnly")}</div>;
  const tab = q("tab") || "activity";
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("usage.title")}</h1>
      <div className="mb-5 flex gap-1 border-b border-mist">
        {["activity", "costs", "prices"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ tab: k, org: null, event: null, user: null })}
            className={"-mb-px border-b-2 px-3 py-2 text-[14px] " + (tab === k ? "border-ember font-medium text-ink" : "border-transparent text-ink-secondary hover:text-ink")}
          >
            {t(`usage.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === "activity" ? <Activity t={t} /> : tab === "costs" ? <Costs t={t} /> : <Prices t={t} />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <UsagePage />
    </Suspense>
  );
}
