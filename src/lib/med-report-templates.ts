import type { DayRow, GridResult } from "@/lib/med-checklist-grid";

const BASE_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p.subtitle { font-size: 12px; color: #555; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  td.check, th.check { text-align: center; white-space: nowrap; }
  .box { font-size: 14px; }
`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function checkbox(checked: boolean): string {
  return `<span class="box">${checked ? "☑" : "☐"}</span>`;
}

export function buildPlanReportHtml(opts: {
  eventName: string;
  dateLabel: string;
  slotName: string;
  rows: DayRow[];
  mode: "blank" | "hybrid";
}): string {
  const { eventName, dateLabel, slotName, rows, mode } = opts;
  const body = rows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.participantName)}</td>
          <td>${escapeHtml(r.participantGroup ?? "")}</td>
          <td>${escapeHtml(r.medName)}</td>
          <td>${escapeHtml(r.dose ?? "")}</td>
          <td class="check">${checkbox(mode === "hybrid" && r.given)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head>
<body>
  <h1>${escapeHtml(eventName)} — Výdej léků</h1>
  <p class="subtitle">${escapeHtml(dateLabel)} · ${escapeHtml(slotName)}</p>
  <table>
    <thead>
      <tr><th>Účastník</th><th>Skupina</th><th>Lék</th><th>Dávka</th><th class="check">Podáno</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
}

export function buildGridReportHtml(opts: {
  eventName: string;
  rangeLabel: string;
  grid: GridResult;
  mode: "blank" | "hybrid";
}): string {
  const { eventName, rangeLabel, grid, mode } = opts;

  const dayHeaderCells = grid.days
    .map((day) => `<th colspan="${grid.slots.length}" class="check">${escapeHtml(formatDay(day))}</th>`)
    .join("");
  const slotHeaderCells = grid.days
    .map(() => grid.slots.map((s) => `<th class="check">${escapeHtml(s.name)}</th>`).join(""))
    .join("");

  const bodyRows = grid.rows
    .map((row) => {
      const cells = grid.days
        .map((day) =>
          grid.slots
            .map((slot) => {
              if (!row.slotIds.includes(slot.id)) return `<td class="check">—</td>`;
              const status = row.days[day]?.[slot.id];
              return `<td class="check">${checkbox(mode === "hybrid" && !!status?.given)}</td>`;
            })
            .join("")
        )
        .join("");
      return `
        <tr>
          <td>${escapeHtml(row.participantName)}<br/><span style="color:#666">${escapeHtml(row.medName)}</span></td>
          ${cells}
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head>
<body>
  <h1>${escapeHtml(eventName)} — Přehled léků</h1>
  <p class="subtitle">${escapeHtml(rangeLabel)}</p>
  <table>
    <thead>
      <tr><th rowspan="2">Účastník / lék</th>${dayHeaderCells}</tr>
      <tr>${slotHeaderCells}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body></html>`;
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}
