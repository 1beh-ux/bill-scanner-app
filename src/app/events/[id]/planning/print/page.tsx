"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import type { PlanPayload } from "@/lib/planning";
import { scheduleRows, type ScheduleRow } from "@/lib/planning-export";
import { formatDayDate } from "@/components/planning/DayTabs";

const selectClass =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

// Printable schedule (step 7): ?day=<id> (default all days, one page each),
// ?leader=<id> for a leader's own schedule. Filters live in the URL so a
// filtered view can be bookmarked or shared.
export default function PlanningPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const router = useRouter();
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const leader = search.get("leader") ?? "";
  const [payload, setPayload] = useState<PlanPayload | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/planning`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPayload);
  }, [eventId]);

  const rows = useMemo(
    () => (payload ? scheduleRows(payload, { dayIds: day ? new Set([day]) : undefined, leaderId: leader || undefined }) : []),
    [payload, day, leader]
  );

  function setFilter(key: "day" | "leader", value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`?${next}`);
  }

  if (!payload) return <div className="p-4 text-[14px] text-ink-secondary md:p-8">{t("common.loading")}</div>;

  const days = [...payload.days].sort((a, b) => a.sortOrder - b.sortOrder).filter((d) => !day || d.id === day);
  const leaderName = payload.leaders.find((l) => l.id === leader)?.name;
  const csvQuery = new URLSearchParams(search).toString();

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <a href={`/events/${eventId}/planning`} className="mr-2 text-[13px] text-ink-secondary hover:text-ink">
          ← {t("nav.planning")}
        </a>
        <select value={day} onChange={(e) => setFilter("day", e.target.value)} className={selectClass}>
          <option value="">{t("planBoard.scopeEvent")}</option>
          {payload.days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select value={leader} onChange={(e) => setFilter("leader", e.target.value)} className={selectClass}>
          <option value="">{t("planBoard.allLeaders")}</option>
          {payload.leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <a href={`/api/events/${eventId}/planning/export${csvQuery ? `?${csvQuery}` : ""}`} className="ml-auto text-[13px] text-ember hover:underline">
          {t("planBoard.csv")}
        </a>
        <button onClick={() => window.print()} className="rounded-lg bg-ember px-4 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover">
          {t("planBoard.print")}
        </button>
      </div>

      {days.map((d, i) => (
        <section key={d.id} className="mb-8" style={i > 0 ? { breakBefore: "page" } : undefined}>
          <h1 className="text-[20px] font-semibold text-ink">
            {payload.event.name} — {d.label}
            {d.date && <span className="ml-2 font-normal text-ink-secondary">{formatDayDate(d.date)}</span>}
          </h1>
          {(leaderName || d.theme) && (
            <p className="mb-2 text-[13px] text-ink-secondary">{[leaderName && t("planBoard.printFor", { name: leaderName }), d.theme].filter(Boolean).join(" · ")}</p>
          )}
          <DayTable rows={rows.filter((r) => r.dayId === d.id)} hideLeader={Boolean(leader)} t={t} />
        </section>
      ))}
    </div>
  );
}

function DayTable({ rows, hideLeader, t }: { rows: ScheduleRow[]; hideLeader: boolean; t: (key: string) => string }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-secondary">{t("planBoard.printEmpty")}</p>;
  const cell = "border-b border-mist px-2 py-1 align-top";
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="text-left text-ink-secondary">
          <th className={cell + " w-[90px] font-medium"}>{t("planBoard.time")}</th>
          <th className={cell + " font-medium"}>{t("planBoard.activity")}</th>
          {!hideLeader && <th className={cell + " font-medium"}>{t("planBoard.leader")}</th>}
          <th className={cell + " font-medium"}>{t("planBoard.location")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const newWindow = i === 0 || rows[i - 1].windowName !== r.windowName;
          return (
            <FragmentRows key={i} newWindow={newWindow} windowLabel={`${r.windowName} (${r.windowStart}–${r.windowEnd})`} colSpan={hideLeader ? 3 : 4}>
              <tr style={{ breakInside: "avoid" }}>
                <td className={cell + " whitespace-nowrap text-ink"}>
                  {r.start}–{r.end}
                  {r.parallel && <span className="ml-1 text-ink-secondary" title={t("planBoard.parallel")}>∥</span>}
                </td>
                <td className={cell + " text-ink"}>
                  <div className="font-medium">{r.activity}</div>
                  {r.description && <div className="text-[11.5px] text-ink-secondary">{r.description}</div>}
                  {r.notes && <div className="text-[11.5px] italic text-ink-secondary">{r.notes}</div>}
                </td>
                {!hideLeader && <td className={cell + " text-ink"}>{r.leader}</td>}
                <td className={cell + " text-ink"}>{r.location}</td>
              </tr>
            </FragmentRows>
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRows({ newWindow, windowLabel, colSpan, children }: { newWindow: boolean; windowLabel: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      {newWindow && (
        <tr>
          <td colSpan={colSpan} className="bg-mist/40 px-2 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
            {windowLabel}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
