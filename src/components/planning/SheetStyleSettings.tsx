"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { ScheduleDay, ScheduleRow } from "@/lib/planning-export";
import { buildSheetModel, DEFAULT_SHEET_STYLE, type SheetCategory, type SheetModel, type SheetStyle } from "@/lib/planning-sheet";

// Nastavení -> "Vzhled exportu do Google tabulky": the user's own design for
// the Drive export, with a live preview built by the same buildSheetModel the
// export uses, on small fixed demo data.

const CATS: SheetCategory[] = [
  { id: "teorie", name: "Teorie", color: "#60a5fa", group: "primary", counted: true },
  { id: "praxe", name: "Praxe", color: "#34d399", group: "primary", counted: true },
  { id: "org", name: "Organizace", color: "#fbbf24", group: "primary", counted: false },
];
const LEADER_COLORS = { tom: "#93c5fd", anna: "#f9a8d4", eva: "#86efac" };

function row(partial: Partial<ScheduleRow> & { activity: string }): ScheduleRow {
  return {
    dayId: "", dayLabel: "", date: null, windowName: "", windowStart: "", windowEnd: "", start: "", end: "", startMin: 0,
    durationMin: 0, parallel: false, description: "", primaryCategory: "", primaryColor: null, secondaryCategory: "",
    leader: "", leaderId: null, location: "", groups: "", notes: "", categoryMinutes: {}, mainCategoryIds: [], mainSegments: [],
    ...partial,
  };
}
const slot = (start: string, end: string, branches: ScheduleRow[]) => ({ start, end, startMin: 0, durationMin: 0, branches });
const DEMO_DAYS: ScheduleDay[] = [
  {
    id: "d1", label: "Den 1", date: "2026-07-10", theme: null,
    windows: [
      {
        name: "Dopoledne", start: "08:00", end: "12:00",
        slots: [
          slot("08:00", "08:30", [row({ activity: "Snídaně", location: "Jídelna", mainCategoryIds: ["org"] })]),
          slot("09:00", "10:30", [
            row({ activity: "Lukostřelba", description: "Základy a bezpečnost", leader: "Tom", leaderId: "tom", location: "Louka", groups: "Vlci", mainCategoryIds: ["praxe"], categoryMinutes: { praxe: 90 } }),
            row({ activity: "Přednáška", description: "Úvod do tématu", leader: "Anna", leaderId: "anna", location: "Klubovna", groups: "Lišky", mainCategoryIds: ["teorie"], categoryMinutes: { teorie: 90 } }),
          ]),
          slot("10:30", "11:00", [row({ activity: "Mikrosimulace", leader: "Anna", leaderId: "anna", mainCategoryIds: ["teorie", "praxe"], categoryMinutes: { teorie: 10, praxe: 20 } })]),
        ],
      },
    ],
  },
  {
    id: "d2", label: "Den 2", date: "2026-07-11", theme: null,
    windows: [{ name: "Program", start: "09:00", end: "12:00", slots: [slot("09:00", "12:00", [row({ activity: "Výlet", leader: "Eva", leaderId: "eva", mainCategoryIds: ["praxe"], categoryMinutes: { praxe: 180 } })])] }],
  },
];

export default function SheetStyleSettings({ value, onChange }: { value: SheetStyle; onChange: (next: SheetStyle) => void }) {
  const { t } = useTranslations();
  const [style, setStyle] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt the saved style once it loads from /api/me.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from the loaded preference
    setStyle(value);
  }, [value]);

  // Local state for instant preview; save after the user pauses (color pickers fire continuously).
  function update(patch: Partial<SheetStyle>) {
    const next = { ...style, ...patch };
    setStyle(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 600);
  }

  const model = useMemo(
    () => buildSheetModel({ eventName: "Ukázková akce", days: DEMO_DAYS, categories: CATS, leaderColors: LEADER_COLORS }, style),
    [style]
  );

  const colors: [keyof SheetStyle, string][] = [
    ["titleBg", "sheetStyle.titleBg"],
    ["headerBg", "sheetStyle.headerBg"],
    ["headerText", "sheetStyle.headerText"],
    ["zebraColor", "sheetStyle.zebraColor"],
  ];
  const toggles: [keyof SheetStyle, string][] = [
    ["zebra", "sheetStyle.zebra"],
    ["mergeDays", "sheetStyle.mergeDays"],
    ["mergeTimes", "sheetStyle.mergeTimes"],
    ["colorOrganization", "sheetStyle.colorOrganization"],
    ["colorLeaders", "sheetStyle.colorLeaders"],
    ["showCategoryColumns", "sheetStyle.showCategoryColumns"],
    ["showDescription", "sheetStyle.showDescription"],
    ["showLocation", "sheetStyle.showLocation"],
    ["showGroups", "sheetStyle.showGroups"],
    ["showSecondary", "sheetStyle.showSecondary"],
    ["showNotes", "sheetStyle.showNotes"],
  ];

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap gap-4">
        {colors.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-ink">
            <input
              type="color"
              value={style[key] as string}
              onChange={(e) => update({ [key]: e.target.value })}
              className="h-7 w-10 rounded border border-mist bg-paper-2"
            />
            {t(label)}
          </label>
        ))}
        <label className="flex items-center gap-2 text-ink">
          {t("sheetStyle.fontSize")}
          <input
            type="number"
            min={8}
            max={14}
            value={style.fontSize}
            onChange={(e) => update({ fontSize: Math.min(14, Math.max(8, Number(e.target.value) || 10)) })}
            className="w-16 rounded-lg border border-mist bg-paper-2 px-2 py-1 text-ink"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {toggles.map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2 text-ink">
            <input type="checkbox" checked={style[key] as boolean} onChange={(e) => update({ [key]: e.target.checked })} />
            {t(label)}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-secondary">{t("sheetStyle.previewHint")}</span>
        <button onClick={() => update(DEFAULT_SHEET_STYLE)} className="text-[12px] text-ember hover:underline">
          {t("sheetStyle.reset")}
        </button>
      </div>
      <SheetPreview model={model} fontSize={style.fontSize} />
    </div>
  );
}

/** The sheet model as an HTML table: merges -> rowSpan/colSpan, formats -> inline styles. */
export function SheetPreview({ model, fontSize }: { model: SheetModel; fontSize: number }) {
  const covered = new Set<string>();
  const spans = new Map<string, { rowSpan: number; colSpan: number }>();
  for (const m of model.merges) {
    spans.set(`${m.row}:${m.col}`, { rowSpan: m.rows, colSpan: m.cols });
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.col; c < m.col + m.cols; c++) if (r !== m.row || c !== m.col) covered.add(`${r}:${c}`);
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-mist bg-white">
      <table className="border-collapse" style={{ fontSize: `${fontSize + 2}px`, fontFamily: "Arial, sans-serif", color: "#111827" }}>
        <colgroup>
          {model.colWidths.map((w, i) => (
            <col key={i} style={{ width: Math.round(w * 0.8) }} />
          ))}
        </colgroup>
        <tbody>
          {model.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                covered.has(`${r}:${c}`) ? null : (
                  <td
                    key={c}
                    {...spans.get(`${r}:${c}`)}
                    style={{
                      background: cell.bg ?? "#ffffff",
                      color: cell.color,
                      fontWeight: cell.bold ? 700 : 400,
                      textAlign: cell.center ? "center" : "left",
                      border: "1px solid #e5e7eb",
                      padding: "3px 6px",
                      verticalAlign: "middle",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {cell.v}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
