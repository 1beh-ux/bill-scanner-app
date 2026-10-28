"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { CreateAdultForm } from "@/components/adults/AdultForm";
import { ageOn } from "@/lib/age";
import { adultReportRows, reportCsv, reportTotals } from "@/lib/adults";
import { pluralForm } from "@/lib/plural";

// Dospělí na akci (2026-10-28): the event's leaders, helpers and cooks from Lidé -- who is here when and
// eats here -- plus the report for income / subsidies (facts only). Not participants: no registration,
// no portal, no e-mail. The Kuchyně grant (organization admins too); new people only by admins.
type Adult = { id: string; childId: string; name: string; dateOfBirth: string | null; fieldValues: Record<string, unknown> | null; label: string | null; fromDate: string | null; toDate: string | null; eats: boolean };
type Data = { event: { name: string; startDate: string; endDate: string }; canCreate: boolean; adults: Adult[] };
type Candidate = { id: string; name: string; dateOfBirth: string | null; assigned: boolean };

const inputSm = "rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");

export default function EventAdultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<"list" | "report">("list");
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const url = `/api/events/${id}/adults`;

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  async function patch(personId: string, body: Record<string, unknown>) {
    await fetch(`${url}/${personId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    load();
  }
  async function remove(a: Adult) {
    if (!(await confirm({ message: t("adults.confirmRemove", { name: a.name }), danger: true }))) return;
    await fetch(`${url}/${a.id}`, { method: "DELETE" }).catch(() => null);
    load();
  }

  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("adults.noAccess")}</div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const { startDate, endDate } = data.event;
  const count = data.adults.length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("adults.navTitle")}</h1>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-secondary">{t("adults.pageHint")}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["list", "report"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"rounded-full px-3 py-1 text-[13px] " + (tab === k ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist")}>
            {t(`adults.tab.${k}`)}
          </button>
        ))}
        <span className="text-[13px] text-ink-secondary">
          {count} {t(`adults.count.${pluralForm(count, lang)}`)}
        </span>
      </div>

      {tab === "list" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPicking(!picking)} className={btnPrimary}>
              {t("adults.addFromPeople")}
            </button>
            {data.canCreate ? (
              <button type="button" onClick={() => setCreating(!creating)} className={btn}>
                + {t("adults.addNew")}
              </button>
            ) : (
              <span className="text-[12.5px] text-ink-secondary">{t("adults.addNewAdminOnly")}</span>
            )}
          </div>
          {picking && <PickAdults url={url} startDate={startDate} endDate={endDate} onDone={() => { setPicking(false); load(); }} />}
          {creating && (
            <div className="mb-4">
              <CreateAdultForm
                onCancel={() => setCreating(false)}
                submit={async (adult) => {
                  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ create: adult }) }).catch(() => null);
                  if (!res?.ok) return false;
                  setCreating(false);
                  load();
                  return true;
                }}
              />
            </div>
          )}
          {count === 0 ? (
            <p className="text-[14px] text-ink-secondary">{t("adults.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-mist">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
                    <th className="p-2 font-medium">{t("adults.colName")}</th>
                    <th className="p-2 font-medium">{t("adults.colLabel")}</th>
                    <th className="p-2 font-medium">{t("adults.dateOfBirth")}</th>
                    <th className="p-2 font-medium">{t("adults.colAgeStart")}</th>
                    <th className="p-2 font-medium">{t("adults.colFrom")}</th>
                    <th className="p-2 font-medium">{t("adults.colTo")}</th>
                    <th className="p-2 font-medium">{t("adults.colEats")}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.adults.map((a) => {
                    const outside = (a.fromDate ?? startDate) < startDate || (a.toDate ?? endDate) > endDate;
                    return (
                      <tr key={a.id} className="border-b border-mist/60 align-top">
                        <td className="p-2 text-ink">
                          <a href={`/children/${a.childId}`} className="hover:underline">
                            {a.name}
                          </a>
                        </td>
                        <td className="p-2">
                          <input defaultValue={a.label ?? ""} onBlur={(e) => e.target.value !== (a.label ?? "") && patch(a.id, { label: e.target.value })} placeholder={t("adults.labelPlaceholder")} className={inputSm + " w-32"} />
                        </td>
                        <td className="p-2 text-ink-secondary">{fmt(a.dateOfBirth)}</td>
                        <td className="p-2 tabular-nums text-ink-secondary">{ageOn(a.dateOfBirth, new Date(`${startDate}T00:00:00Z`)) ?? "—"}</td>
                        <td className="p-2">
                          <input type="date" value={a.fromDate ?? ""} onChange={(e) => patch(a.id, { fromDate: e.target.value || null })} className={inputSm} aria-label={t("adults.colFrom")} />
                        </td>
                        <td className="p-2">
                          <input type="date" value={a.toDate ?? ""} onChange={(e) => patch(a.id, { toDate: e.target.value || null })} className={inputSm} aria-label={t("adults.colTo")} />
                          {outside && <p className="mt-0.5 text-[11.5px] text-amber-700">{t("adults.outsideEvent")}</p>}
                        </td>
                        <td className="p-2">
                          <input type="checkbox" checked={a.eats} onChange={(e) => patch(a.id, { eats: e.target.checked })} aria-label={t("adults.colEats")} />
                        </td>
                        <td className="p-2 text-right">
                          <button type="button" onClick={() => remove(a)} className="text-[12.5px] text-red-600 hover:underline">
                            {t("adults.remove")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="p-2 text-[11.5px] text-ink-secondary">{t("adults.datesHint", { from: fmt(startDate), to: fmt(endDate) })}</p>
            </div>
          )}
        </>
      ) : (
        <Report adults={data.adults} eventName={data.event.name} startDate={startDate} endDate={endDate} />
      )}
    </div>
  );
}

/** "Přidat z lidí": the organization's adults (search, tick several; those already here are greyed out). */
function PickAdults({ url, startDate, endDate, onDone }: { url: string; startDate: string; endDate: string; onDone: () => void }) {
  const { t } = useTranslations();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`${url}/candidates`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => setList([]));
  }, [url]);
  const shown = (list ?? []).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  async function add() {
    setBusy(true);
    // The event's own dates are stored as "none" (they follow the event if it moves).
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childIds: [...picked], fromDate: from === startDate ? null : from, toDate: to === endDate ? null : to }),
    }).catch(() => null);
    setBusy(false);
    onDone();
  }
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("children.search")} className={inputSm + " w-56"} />
        <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
          {t("adults.colFrom")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputSm} />
        </label>
        <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
          {t("adults.colTo")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputSm} />
        </label>
      </div>
      {!list ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-ink-secondary">{t("adults.noAdultsInPeople")}</p>
      ) : (
        <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
          {shown.map((c) => (
            <label key={c.id} className={"flex items-center gap-2 text-[13.5px] " + (c.assigned ? "text-ink-secondary opacity-60" : "text-ink")}>
              <input
                type="checkbox"
                disabled={c.assigned}
                checked={c.assigned || picked.has(c.id)}
                onChange={(e) => setPicked((x) => { const n = new Set(x); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
              />
              {c.name}
              {c.dateOfBirth && <span className="text-[11.5px] text-ink-secondary">{fmt(c.dateOfBirth)}</span>}
              {c.assigned && <span className="text-[11.5px]">· {t("adults.alreadyHere")}</span>}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={add} disabled={busy || picked.size === 0} className={btnPrimary}>
          {t("adults.addPicked", { n: String(picked.size) })}
        </button>
        <button type="button" onClick={onDone} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

/** The report: age on a chosen date, address, from–to, days at the event; totals and an age range; CSV. */
function Report({ adults, eventName, startDate, endDate }: { adults: Adult[]; eventName: string; startDate: string; endDate: string }) {
  const { t } = useTranslations();
  const [ageDate, setAgeDate] = useState(startDate);
  const [ageFrom, setAgeFrom] = useState("");
  const [ageTo, setAgeTo] = useState("");
  const rows = useMemo(() => adultReportRows(adults, startDate, endDate, ageDate || startDate), [adults, startDate, endDate, ageDate]);
  const totals = reportTotals(rows, ageFrom === "" ? null : Number(ageFrom), ageTo === "" ? null : Number(ageTo));
  const header = [t("adults.colName"), t("adults.dateOfBirth"), t("adults.colAgeOn"), t("adults.municipality"), t("adults.zip"), t("adults.colFrom"), t("adults.colTo"), t("adults.colDays")];

  function download() {
    const blob = new Blob([reportCsv(rows, header)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dospeli-${eventName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "akce"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("adults.colAgeOn")}
          <input type="date" value={ageDate} onChange={(e) => setAgeDate(e.target.value)} className={inputSm} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("adults.ageFrom")}
          <input type="number" min={0} max={120} value={ageFrom} onChange={(e) => setAgeFrom(e.target.value)} className={inputSm + " w-20"} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("adults.ageTo")}
          <input type="number" min={0} max={120} value={ageTo} onChange={(e) => setAgeTo(e.target.value)} className={inputSm + " w-20"} />
        </label>
        <button type="button" onClick={download} disabled={rows.length === 0} className={btn}>
          {t("adults.csv")}
        </button>
      </div>
      <p className="text-[13.5px] text-ink">
        {t("adults.totals", { people: String(totals.people), days: String(totals.personDays) })}
        {(ageFrom !== "" || ageTo !== "") && <> · {t("adults.totalsRange", { n: String(totals.inRange), days: String(totals.inRangeDays) })}</>}
      </p>
      <div className="overflow-x-auto rounded-lg border border-mist">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
              {header.map((h) => (
                <th key={h} className="p-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-mist/60">
                <td className="p-2 text-ink">{r.name}</td>
                <td className="p-2 text-ink-secondary">{fmt(r.dateOfBirth)}</td>
                <td className="p-2 tabular-nums">{r.age ?? "—"}</td>
                <td className="p-2">{r.municipality || "—"}</td>
                <td className="p-2 tabular-nums">{r.zip || "—"}</td>
                <td className="p-2 tabular-nums">{fmt(r.from)}</td>
                <td className="p-2 tabular-nums">{fmt(r.to)}</td>
                <td className="p-2 tabular-nums">{r.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-ink-secondary">{t("adults.reportHint")}</p>
    </div>
  );
}
