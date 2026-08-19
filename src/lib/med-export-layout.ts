export type ExportColumnKey = { day: string; slotId: string };

export interface MedExportLayout {
  landscape: boolean;
  fontSizePt: number;
  colWidthMm: number;
  stickyColWidthMm: number;
  /** Column keys chunked into physical pages ("bands") -- print one table per band, glue side by side. */
  bands: ExportColumnKey[][];
}

const PAGE_MM: Record<"A4" | "A3", { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};
const MARGIN_MM = 10; // matches the fixed margin the PDF microservice applies on every side
const STICKY_COL_WIDTH_MM = 38;
const MIN_COL_WIDTH_MM = 6.5; // floor for a checkbox + a rotated 8pt label to stay legible
const MAX_COL_WIDTH_MM = 13; // don't let columns balloon when there are very few of them
const ROOMY_FONT_PT = 10;
const COMPACT_FONT_PT = 8;
const ROOMY_COL_THRESHOLD_MM = 9;

/**
 * Decides orientation (whichever axis -- participant/med rows vs. day×period
 * columns -- is larger gets the page's long side), a column width/font size
 * that keeps text at or above 8pt, and if even the 8pt floor can't fit every
 * column on one physical page, splits columns into day-aligned bands (never
 * splitting a single day's periods across bands unless one day alone has
 * more periods than fit on a page) so each band prints as its own page,
 * meant to be glued together.
 */
export function planMedsExportLayout(opts: {
  format: "A4" | "A3";
  rowCount: number;
  columns: ExportColumnKey[];
}): MedExportLayout {
  const { format, rowCount, columns } = opts;
  const landscape = columns.length > rowCount;

  const page = PAGE_MM[format];
  const pageWidthMm = landscape ? page.h : page.w;
  const pageHeightMm = landscape ? page.w : page.h;
  const availableWidthMm = pageWidthMm - 2 * MARGIN_MM - STICKY_COL_WIDTH_MM;

  const idealColWidthMm = columns.length > 0 ? availableWidthMm / columns.length : MAX_COL_WIDTH_MM;

  let colWidthMm: number;
  let fontSizePt: number;
  let bands: ExportColumnKey[][];

  if (idealColWidthMm >= MIN_COL_WIDTH_MM) {
    // Everything fits on one page -- use as much width as makes sense
    // without stretching columns absurdly wide for a short date range.
    colWidthMm = Math.min(idealColWidthMm, MAX_COL_WIDTH_MM);
    fontSizePt = colWidthMm >= ROOMY_COL_THRESHOLD_MM ? ROOMY_FONT_PT : COMPACT_FONT_PT;
    bands = columns.length > 0 ? [columns] : [[]];
  } else {
    // Even the compact floor doesn't fit everything -- split into bands,
    // keeping each day's periods together where possible.
    colWidthMm = MIN_COL_WIDTH_MM;
    fontSizePt = COMPACT_FONT_PT;
    const colsPerBand = Math.max(1, Math.floor(availableWidthMm / MIN_COL_WIDTH_MM));
    bands = chunkByDay(columns, colsPerBand);
  }

  return { landscape, fontSizePt, colWidthMm, stickyColWidthMm: STICKY_COL_WIDTH_MM, bands };
}

function chunkByDay(columns: ExportColumnKey[], colsPerBand: number): ExportColumnKey[][] {
  const days: string[] = [];
  const byDay = new Map<string, ExportColumnKey[]>();
  for (const col of columns) {
    if (!byDay.has(col.day)) {
      byDay.set(col.day, []);
      days.push(col.day);
    }
    byDay.get(col.day)!.push(col);
  }

  const bands: ExportColumnKey[][] = [];
  let current: ExportColumnKey[] = [];
  for (const day of days) {
    const dayCols = byDay.get(day)!;
    if (dayCols.length > colsPerBand) {
      // A single day alone doesn't fit -- flush what we have, then slice
      // this day raw across as many bands as it needs.
      if (current.length > 0) {
        bands.push(current);
        current = [];
      }
      for (let i = 0; i < dayCols.length; i += colsPerBand) {
        bands.push(dayCols.slice(i, i + colsPerBand));
      }
      continue;
    }
    if (current.length + dayCols.length > colsPerBand) {
      bands.push(current);
      current = [];
    }
    current.push(...dayCols);
  }
  if (current.length > 0) bands.push(current);
  return bands.length > 0 ? bands : [[]];
}
