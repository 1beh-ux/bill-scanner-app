// The designed Google Sheet export (design doc "Export"): the schedule as a
// grid model -- values, colors, merges -- built by one pure function, so the
// settings preview and the real Sheet (drive.ts writeFormattedSheet) match.
// Style is per user (User.uiPrefs.planningSheetStyle); the exporting user's
// style is what the event's shared Sheet gets.

import { scheduleDays, type ScheduleDay } from "@/lib/planning-export";

export type SheetStyle = {
  titleBg: string;
  headerBg: string;
  headerText: string;
  fontSize: number;
  zebra: boolean;
  zebraColor: string;
  mergeDays: boolean;
  mergeTimes: boolean;
  colorOrganization: boolean; // rows whose main categories are all out of the analysis
  colorLeaders: boolean;
  showDescription: boolean;
  showLocation: boolean;
  showGroups: boolean;
  showSecondary: boolean;
  showNotes: boolean;
  showCategoryColumns: boolean; // one minutes column per analysed main category
};

export const DEFAULT_SHEET_STYLE: SheetStyle = {
  titleBg: "#1f2937",
  headerBg: "#e5e7eb",
  headerText: "#111827",
  fontSize: 10,
  zebra: true,
  zebraColor: "#f8fafc",
  mergeDays: true,
  mergeTimes: true,
  colorOrganization: true,
  colorLeaders: true,
  showDescription: true,
  showLocation: true,
  showGroups: false,
  showSecondary: false,
  showNotes: false,
  showCategoryColumns: true,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Untrusted input -> a complete style (unknown keys dropped, bad values -> defaults). */
export function sanitizeSheetStyle(input: unknown): SheetStyle {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SHEET_STYLE } as Record<string, unknown>;
  for (const [key, def] of Object.entries(DEFAULT_SHEET_STYLE)) {
    const v = src[key];
    if (typeof def === "boolean" && typeof v === "boolean") out[key] = v;
    if (typeof def === "string" && typeof v === "string" && HEX.test(v)) out[key] = v.toLowerCase();
    if (typeof def === "number" && typeof v === "number" && Number.isFinite(v)) out[key] = Math.min(14, Math.max(8, Math.round(v)));
  }
  return out as SheetStyle;
}

export type SheetCell = { v: string | number; bg?: string; color?: string; bold?: boolean; center?: boolean };
export type SheetMerge = { row: number; col: number; rows: number; cols: number };
export type SheetModel = { rows: SheetCell[][]; merges: SheetMerge[]; frozenRows: number; colWidths: number[] };

export type SheetCategory = { id: string; name: string; color: string | null; group: "primary" | "secondary"; counted: boolean };

/** Hex color mixed toward white (amount 0..1) -- full category colors are too loud as cell fills. */
export function tint(hex: string | null | undefined, amount = 0.6): string | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * amount);
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}

const formatDate = (date: string | null) => {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  return `${["ne", "po", "út", "st", "čt", "pá", "so"][d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
};

export function buildSheetModel(
  input: { eventName: string; days: ScheduleDay[]; categories: SheetCategory[]; leaderColors: Record<string, string | undefined> },
  style: SheetStyle
): SheetModel {
  const analysed = input.categories.filter((c) => c.group === "primary" && c.counted);
  const byId = new Map(input.categories.map((c) => [c.id, c]));

  type Col = { title: string; width: number; get: (b: ScheduleDay["windows"][number]["slots"][number]["branches"][number]) => string | number; kind?: "leader" | "minutes" };
  const cols: Col[] = [
    { title: "Aktivita", width: 220, get: (b) => b.activity },
    ...(style.showDescription ? [{ title: "Popis", width: 260, get: (b) => b.description } as Col] : []),
    { title: "Vedoucí", width: 110, get: (b) => b.leader, kind: "leader" },
    ...(style.showLocation ? [{ title: "Místo", width: 110, get: (b) => b.location } as Col] : []),
    ...(style.showGroups ? [{ title: "Skupiny", width: 110, get: (b) => b.groups } as Col] : []),
    ...(style.showSecondary ? [{ title: "Vedlejší kategorie", width: 140, get: (b) => b.secondaryCategory } as Col] : []),
    ...(style.showNotes ? [{ title: "Poznámka", width: 180, get: (b) => b.notes } as Col] : []),
    ...(style.showCategoryColumns
      ? analysed.map((c) => ({ title: c.name, width: 80, get: (b) => b.categoryMinutes[c.id] || "", kind: "minutes" }) as Col)
      : []),
  ];
  const width = 2 + cols.length;

  const rows: SheetCell[][] = [];
  const merges: SheetMerge[] = [];
  const title: SheetCell[] = [{ v: input.eventName, bg: style.titleBg, color: "#ffffff", bold: true }];
  while (title.length < width) title.push({ v: "", bg: style.titleBg });
  rows.push(title);
  merges.push({ row: 0, col: 0, rows: 1, cols: width });
  rows.push(
    ["Den", "Čas", ...cols.map((c) => c.title)].map((v, i) => ({
      v,
      bg: style.headerBg,
      color: style.headerText,
      bold: true,
      center: cols[i - 2]?.kind === "minutes",
    }))
  );

  let stripe = false;
  for (const day of input.days) {
    const dayStart = rows.length;
    for (const w of day.windows) {
      for (const slot of w.slots) {
        stripe = !stripe;
        const slotStart = rows.length;
        for (const b of slot.branches) {
          const main = b.mainCategoryIds.map((id) => byId.get(id)).filter((c): c is SheetCategory => !!c);
          const organization = style.colorOrganization && main.length > 0 && main.every((c) => !c.counted);
          const rowBg = organization ? tint(main[0].color, 0.55) : style.zebra && stripe ? style.zebraColor : undefined;
          rows.push([
            { v: `${day.label}${day.date ? `\n${formatDate(day.date)}` : ""}`, bold: true, bg: style.mergeDays ? undefined : rowBg },
            { v: `${slot.start}–${slot.end}`, bg: rowBg },
            ...cols.map((c): SheetCell => {
              const v = c.get(b);
              const leaderBg = c.kind === "leader" && style.colorLeaders && b.leaderId ? tint(input.leaderColors[b.leaderId], 0.45) : undefined;
              return { v, bg: leaderBg ?? rowBg, center: c.kind === "minutes" };
            }),
          ]);
        }
        if (style.mergeTimes && rows.length - slotStart > 1) merges.push({ row: slotStart, col: 1, rows: rows.length - slotStart, cols: 1 });
      }
    }
    if (style.mergeDays && rows.length - dayStart > 1) merges.push({ row: dayStart, col: 0, rows: rows.length - dayStart, cols: 1 });
  }

  return { rows, merges, frozenRows: 2, colWidths: [90, 95, ...cols.map((c) => c.width)] };
}

/** Model input from the board payload (whole event). */
export function sheetInputFromPayload(p: import("@/lib/planning").PlanPayload) {
  return {
    eventName: p.event.name,
    days: scheduleDays(p),
    categories: p.categories.map(
      (c): SheetCategory => ({
        id: c.id,
        name: c.name,
        color: c.data?.color ?? null,
        group: c.data?.group === "secondary" ? "secondary" : "primary",
        counted: c.data?.countInAnalysis !== false,
      })
    ),
    leaderColors: Object.fromEntries(p.leaders.map((l) => [l.id, l.data?.color])),
  };
}
