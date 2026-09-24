"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import type { PlanPayload } from "@/lib/planning";
import { scheduleDays } from "@/lib/planning-export";
import { scheduleHtml } from "@/lib/planning-pdf";
import DriveSheetExport from "@/components/planning/DriveSheetExport";

const selectClass =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnSecondary = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist";

// Schedule export page: filters live in the URL (?day, ?leader, ?group) so a
// filtered view can be bookmarked. The preview is the exact HTML the PDF
// service renders (src/lib/planning-pdf.ts), so preview, print and PDF match.
export default function PlanningPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const router = useRouter();
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const leader = search.get("leader") ?? "";
  const group = search.get("group") ?? "";
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/planning`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPayload);
  }, [eventId]);

  const html = useMemo(() => {
    if (!payload) return "";
    const leaderName = payload.leaders.find((l) => l.id === leader)?.name;
    return scheduleHtml({
      eventName: payload.event.name,
      days: scheduleDays(payload, { dayIds: day ? new Set([day]) : undefined, leaderId: leader || undefined, group: group || undefined }),
      subtitle: [leaderName, group].filter(Boolean).map((n) => t("planBoard.printFor", { name: String(n) })).join(" · ") || undefined,
      showLeader: !leader,
    });
  }, [payload, day, leader, group, t]);

  function setFilter(key: "day" | "leader" | "group", value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`?${next}`);
  }

  if (!payload) return <div className="p-4 text-[14px] text-ink-secondary md:p-8">{t("common.loading")}</div>;
  const query = search.toString() ? `?${search}` : "";

  return (
    <div className="flex h-[calc(100vh-1px)] flex-col p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        {payload.groups.length > 0 && (
          <select value={group} onChange={(e) => setFilter("group", e.target.value)} className={selectClass}>
            <option value="">{t("planBoard.allGroups")}</option>
            {payload.groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={`/api/events/${eventId}/planning/export${query}`} className={btnSecondary}>
            {t("planBoard.csv")}
          </a>
          <button onClick={() => frame.current?.contentWindow?.print()} className={btnSecondary}>
            {t("planBoard.print")}
          </button>
          <a
            href={`/api/events/${eventId}/planning/pdf${query}`}
            className="rounded-lg bg-ember px-4 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover"
          >
            {t("planBoard.downloadPdf")}
          </a>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 px-3 py-2">
        <span className="text-[13px] font-medium text-ink">{t("planBoard.driveTitle")}</span>
        <DriveSheetExport eventId={eventId} />
      </div>
      <iframe ref={frame} srcDoc={html} title={t("planBoard.print")} className="min-h-[60vh] w-full flex-1 rounded-lg border border-mist bg-white" />
    </div>
  );
}
