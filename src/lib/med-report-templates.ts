import type { GridResult, GridRow } from "@/lib/med-checklist-grid";
import { planMedsExportLayout, type ExportColumnKey } from "@/lib/med-export-layout";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function checkbox(checked: boolean): string {
  return `<span class="box">${checked ? "&#9745;" : "&#9744;"}</span>`;
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

/** Runs of consecutive columns sharing the same day, for building colspan'd day headers. */
function dayRuns(columns: ExportColumnKey[]): { day: string; count: number }[] {
  const runs: { day: string; count: number }[] = [];
  for (const col of columns) {
    const last = runs[runs.length - 1];
    if (last && last.day === col.day) last.count += 1;
    else runs.push({ day: col.day, count: 1 });
  }
  return runs;
}

function baseStyle(fontSizePt: number, colWidthMm: number, stickyColWidthMm: number): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 15px; margin: 0 0 3px; }
    p.subtitle { font-size: 11px; color: #555; margin: 0 0 8px; }
    /* No explicit width: with table-layout: fixed, the table sizes itself
       to the sum of its <col> widths below, so a band with fewer day-columns
       (the last page of a split export) stays exactly as wide as its own
       columns instead of stretching to fill the page. */
    table { border-collapse: collapse; font-size: ${fontSizePt}px; table-layout: fixed; }
    th, td { border: 1px solid #bbb; padding: 1px 2px; text-align: center; vertical-align: middle; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    col.sticky { width: ${stickyColWidthMm}mm; }
    col.data { width: ${colWidthMm}mm; }
    th.name, td.name { text-align: left; white-space: normal; font-size: ${fontSizePt}px; padding: 2px 4px; }
    td.name .medname { color: #666; font-size: ${Math.max(fontSizePt - 1, 7)}px; }
    th.period { height: 20mm; padding: 2px 0; }
    /* A single sideways line of text, sized by the layout engine itself
       (not a post-hoc transform), so it can't visually overflow into the
       row above the way a rotated inline-block with the wrong
       transform-origin can. */
    th.period .rot {
      writing-mode: vertical-rl;
      text-orientation: sideways;
      transform: rotate(180deg);
      white-space: nowrap;
      margin: 0 auto;
      font-weight: 500;
    }
    .box { font-size: ${fontSizePt + 1}px; line-height: 1; }
    tr.shade-b td { background: #f3f3f3; }
    tr.group-first td { border-top: 2px solid #333; }
    tr.group-last td { border-bottom: 2px solid #333; }
    td.group-edge-left { border-left: 2px solid #333; }
    td.group-edge-right { border-right: 2px solid #333; }
    th.day-start, td.day-start { border-left: 2px solid #333; }
    p.gluehint { font-size: 10px; color: #777; margin: 4px 0 0; }
  `;
}

interface ParticipantGroupMeta {
  isFirst: boolean;
  isLast: boolean;
  shadeB: boolean;
  hasMultiple: boolean;
}

/** Assumes grid.rows is already sorted so a participant's med rows are contiguous (see fetchMedChecklistGrid's orderBy). */
function computeGroupMeta(rows: GridRow[]): ParticipantGroupMeta[] {
  const meta: ParticipantGroupMeta[] = [];
  let shadeToggle = false;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].participantId === rows[i].participantId) j += 1;
    const groupSize = j - i;
    for (let k = i; k < j; k++) {
      meta.push({ isFirst: k === i, isLast: k === j - 1, shadeB: shadeToggle, hasMultiple: groupSize > 1 });
    }
    shadeToggle = !shadeToggle;
    i = j;
  }
  return meta;
}

function renderBandTable(opts: {
  grid: GridResult;
  mode: "blank" | "hybrid";
  band: ExportColumnKey[];
  groupMeta: ParticipantGroupMeta[];
  slotNameById: Map<string, string>;
}): string {
  const { grid, mode, band, groupMeta, slotNameById } = opts;
  const runs = dayRuns(band);

  const dayHeaderCells = runs
    .map((run) => `<th colspan="${run.count}" class="day-start">${escapeHtml(formatDay(run.day))}</th>`)
    .join("");
  const periodHeaderCells = band
    .map((col, colIdx) => {
      const isDayStart = colIdx === 0 || band[colIdx - 1].day !== col.day;
      return `<th class="period${isDayStart ? " day-start" : ""}"><span class="rot">${escapeHtml(slotNameById.get(col.slotId) ?? "")}</span></th>`;
    })
    .join("");

  const colsHtml =
    `<col class="sticky" />` + band.map(() => `<col class="data" />`).join("");

  const bodyRows = grid.rows
    .map((row, i) => {
      const meta = groupMeta[i];
      const rowClasses = [meta.isFirst ? "group-first" : "", meta.isLast ? "group-last" : "", meta.shadeB ? "shade-b" : ""]
        .filter(Boolean)
        .join(" ");
      const nameCellClass = "name" + (meta.hasMultiple ? " group-edge-left" : "");
      const cells = band
        .map((col, colIdx) => {
          const isLastCol = colIdx === band.length - 1;
          const isDayStart = colIdx === 0 || band[colIdx - 1].day !== col.day;
          const cellClass = [meta.hasMultiple && isLastCol ? "group-edge-right" : "", isDayStart ? "day-start" : ""]
            .filter(Boolean)
            .join(" ");
          if (!row.slotIds.includes(col.slotId)) return `<td class="${cellClass}"></td>`;
          const status = row.days[col.day]?.[col.slotId];
          return `<td class="${cellClass}">${checkbox(mode === "hybrid" && !!status?.given)}</td>`;
        })
        .join("");
      return `
        <tr class="${rowClasses}">
          <td class="${nameCellClass}">${escapeHtml(row.participantName)}<div class="medname">${escapeHtml(row.medName)}</div></td>
          ${cells}
        </tr>`;
    })
    .join("");

  return `
    <table>
      <colgroup>${colsHtml}</colgroup>
      <thead>
        <tr><th class="name" rowspan="2">Účastník / lék</th>${dayHeaderCells}</tr>
        <tr>${periodHeaderCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

export function buildMedsGridPdfHtml(opts: {
  eventName: string;
  rangeLabel: string;
  grid: GridResult;
  mode: "blank" | "hybrid";
  format: "A4" | "A3";
  /** Further restrict to these slot ids (the web page's period filter), on top of auto-hiding unused ones. */
  visibleSlotIds?: string[];
}): { html: string; landscape: boolean } {
  const { eventName, rangeLabel, mode, format, visibleSlotIds } = opts;

  // Hide periods nobody actually has a med plan for in this range, and
  // optionally further restrict to whatever the caller says is visible.
  const usedSlotIds = new Set(opts.grid.rows.flatMap((r) => r.slotIds));
  const visibleSet = visibleSlotIds ? new Set(visibleSlotIds) : null;
  const slots = opts.grid.slots.filter((s) => usedSlotIds.has(s.id) && (!visibleSet || visibleSet.has(s.id)));
  const visibleSlotIdSet = new Set(slots.map((s) => s.id));
  // A row whose med isn't given in any currently-visible period would just
  // show as an empty stripe -- drop it rather than print dead rows.
  const rows = opts.grid.rows.filter((r) => r.slotIds.some((id) => visibleSlotIdSet.has(id)));
  const grid: GridResult = { ...opts.grid, slots, rows };

  const columns: ExportColumnKey[] = [];
  for (const day of grid.days) {
    for (const slot of grid.slots) {
      columns.push({ day, slotId: slot.id });
    }
  }

  const layout = planMedsExportLayout({ format, rowCount: grid.rows.length, columns });
  const slotNameById = new Map(grid.slots.map((s) => [s.id, s.name]));
  const groupMeta = computeGroupMeta(grid.rows);

  const pages = layout.bands
    .map((band, bandIndex) => {
      const table = renderBandTable({ grid, mode, band, groupMeta, slotNameById });
      const glueHint =
        layout.bands.length > 1
          ? `<p class="gluehint">Strana ${bandIndex + 1} z ${layout.bands.length} — vytiskněte a slepte vedle sebe.</p>`
          : "";
      return `
        <div class="page">
          <h1>${escapeHtml(eventName)} — Přehled léků</h1>
          <p class="subtitle">${escapeHtml(rangeLabel)}</p>
          ${glueHint}
          ${table}
        </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>${baseStyle(layout.fontSizePt, layout.colWidthMm, layout.stickyColWidthMm)}</style></head>
<body>${pages}</body></html>`;

  return { html, landscape: layout.landscape };
}
