"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { minutesToHhmm, type PlanState } from "@/lib/planning";
import { computeTimes, summarize, type CategoryRow, type Conflict, type EntityRow } from "@/lib/planning-engine";
import { blockLabel } from "./DayPlan";
import type { PlanPayload } from "./types";

export default function SummaryPanel({
  eventId,
  payload,
  plan,
  dayId,
  conflicts,
}: {
  eventId: string;
  payload: PlanPayload;
  plan: PlanState;
  dayId: string | null;
  conflicts: Conflict[];
}) {
  const { t } = useTranslations();
  const [scope, setScope] = useState<"day" | "event">("day");

  const windowIds = new Set(plan.windows.filter((w) => scope === "event" || w.dayId === dayId).map((w) => w.id));
  const s = summarize(plan, windowIds, payload.categories);
  const times = computeTimes(plan);
  const nameIn = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "—";

  const overflowing = plan.windows.filter((w) => windowIds.has(w.id) && (times.windows[w.id]?.overflowMin ?? 0) > 0);
  const scopedConflicts = conflicts.filter((c) => scope === "event" || c.dayId === dayId);
  const dayLabel = (id: string) => payload.days.find((d) => d.id === id)?.label ?? "";

  const dayQuery = scope === "day" && dayId ? `?day=${dayId}` : "";
  const exportLink = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[12px] text-ink hover:bg-mist";

  return (
    <aside className="flex flex-col gap-3 text-[13px]">
      <div className="flex gap-1 rounded-lg bg-mist/50 p-0.5">
        {(["day", "event"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            className={"flex-1 rounded-md px-2 py-1 text-[12px] " + (scope === key ? "bg-paper font-medium text-ink shadow-sm" : "text-ink-secondary")}
          >
            {t(key === "day" ? "planBoard.scopeDay" : "planBoard.scopeEvent")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <a href={`/events/${eventId}/planning/print${dayQuery}`} className={exportLink}>
          {t("planBoard.print")}
        </a>
        <a href={`/api/events/${eventId}/planning/export${dayQuery}`} className={exportLink}>
          {t("planBoard.csv")}
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-ink-secondary">{t("planBoard.capacity")}</dt>
        <dd className="text-right text-ink">{s.capacityMin} min</dd>
        <dt className="text-ink-secondary">{t("planBoard.used")}</dt>
        <dd className="text-right text-ink">{s.usedMin} min</dd>
        <dt className="text-ink-secondary">{t("planBoard.free")}</dt>
        <dd className="text-right text-ink">{s.freeMin} min</dd>
        <dt className="text-ink-secondary">{t("planBoard.overflowLabel")}</dt>
        <dd className={"text-right " + (s.overflowMin > 0 ? "font-medium text-red-600" : "text-ink")}>{s.overflowMin} min</dd>
      </dl>

      <CategoryTable title={t("planLists.primaryCategory")} rows={s.primaryCategories} name={(id) => nameIn(payload.categories, id)} />
      <CategoryTable title={t("planLists.secondaryCategory")} rows={s.secondaryCategories} name={(id) => nameIn(payload.categories, id)} />
      <EntityTable title={t("planLists.leadersLabel")} rows={s.leaders} name={(id) => nameIn(payload.leaders, id)} />
      <EntityTable title={t("planLists.locationsLabel")} rows={s.locations} name={(id) => nameIn(payload.locations, id)} />
      <EntityTable title={t("planBoard.groups")} rows={s.groups} name={(g) => g} />

      {(overflowing.length > 0 || scopedConflicts.length > 0) && (
        <section>
          <h3 className="mb-1 font-medium text-red-600">{t("planBoard.warnings")}</h3>
          <ul className="flex list-none flex-col gap-1 p-0 text-[12px] text-ink">
            {overflowing.map((w) => (
              <li key={w.id}>
                {scope === "event" && `${dayLabel(w.dayId)}: `}
                {t("planBoard.warnOverflow", { window: w.name, over: String(times.windows[w.id].overflowMin) })}
              </li>
            ))}
            {scopedConflicts.map((c) => {
              const block = plan.blocks.find((b) => b.id === c.blockIds[0]);
              const other = plan.blocks.find((b) => b.id === c.blockIds[1]);
              const start = block ? times.slots[block.slotId]?.startMin : undefined;
              return (
                <li key={`${c.type}:${c.blockIds.join(":")}`}>
                  {scope === "event" && `${dayLabel(c.dayId)}: `}
                  {t(c.type === "leader" ? "planBoard.warnLeader" : c.type === "location" ? "planBoard.warnLocation" : "planBoard.warnGroup", {
                    name: c.type === "group" ? c.refId : nameIn(c.type === "leader" ? payload.leaders : payload.locations, c.refId),
                    time: start !== undefined ? minutesToHhmm(start) : "",
                    a: block ? blockLabel(payload, block) : "",
                    b: other ? blockLabel(payload, other) : "",
                  })}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}

function CategoryTable({ title, rows, name }: { title: string; rows: CategoryRow[]; name: (id: string) => string }) {
  const { t } = useTranslations();
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 font-medium text-ink">{title}</h3>
      <table className="w-full text-[12px]">
        <tbody>
          {[...rows].sort((a, b) => b.totalMin - a.totalMin).map((r) => {
            const off = r.targetPercent !== null && Math.abs(r.percent - r.targetPercent) >= 10;
            return (
              <tr key={r.categoryId}>
                <td className="py-0.5 text-ink">{name(r.categoryId)}</td>
                <td className="py-0.5 text-right text-ink-secondary">{r.totalMin} min</td>
                <td className={"py-0.5 text-right " + (off ? "text-red-600" : "text-ink")}>
                  {r.percent} %
                  {r.targetPercent !== null && (
                    <span className="text-ink-secondary" title={t("planLists.targetPercent")}>
                      {" "}/ {r.targetPercent} %
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function EntityTable({ title, rows, name }: { title: string; rows: EntityRow[]; name: (id: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 font-medium text-ink">{title}</h3>
      <table className="w-full text-[12px]">
        <tbody>
          {[...rows].sort((a, b) => b.totalMin - a.totalMin).map((r) => (
            <tr key={r.refId}>
              <td className="py-0.5 text-ink">{name(r.refId)}</td>
              <td className="py-0.5 text-right text-ink-secondary">{r.totalMin} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
