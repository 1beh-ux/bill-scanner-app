import { BODY_MAP_DOT_R, BODY_MAP_H, BODY_MAP_W } from "@/lib/body-map";
import type { EffectiveIncident } from "@/lib/incident-state";

const CATEGORY_LABELS: Record<string, string> = {
  illness: "Nemoc",
  injury: "Úraz",
  parasite: "Parazit",
  medication: "Medikace",
  other: "Ostatní",
};


const BASE_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  p.subtitle { font-size: 12px; color: #555; margin: 0 0 16px; }
  .notes { font-size: 13px; line-height: 1.5; background: #f5f5f5; border-radius: 6px; padding: 10px 12px; }
  .notes p { margin: 0 0 4px; }
  .bodymaps { display: flex; gap: 24px; }
  .bodymap-col { text-align: center; }
  .bodymap-col span { font-size: 11px; color: #666; }
  .incident { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .incident .meta { font-size: 11px; color: #666; margin-bottom: 2px; }
  .incident .code { display: inline-block; min-width: 18px; text-align: center; background: #e05d38; color: #fff; border-radius: 3px; font-size: 11px; padding: 0 4px; margin-right: 6px; }
  .incident .summary { font-size: 13px; }
  .followup { margin-left: 16px; margin-top: 4px; padding-left: 8px; border-left: 2px solid #ddd; }
  .medtable { border-collapse: collapse; width: 100%; font-size: 10px; }
  .medtable th, .medtable td { border: 1px solid #ddd; padding: 3px 5px; text-align: center; }
  .medtable th { background: #f5f5f5; font-weight: 600; }
  .medtable td.medname { text-align: left; font-size: 11px; white-space: nowrap; }
  .medtable .given { color: #1a8a4a; font-weight: bold; }
  .medtable .missed { color: #c0392b; font-weight: bold; }
  .medtable .future { color: #ccc; }
  .medlegend { font-size: 10px; color: #666; margin: 4px 0 0; }
`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("cs-CZ");
}

export type SummaryIncident = EffectiveIncident & { followUps: EffectiveIncident[]; code: string | null };

export type MedConfirmationCell = { date: string; given: boolean; givenAt: string | null };
export type MedConfirmationRow = { medName: string; slotName: string; cells: MedConfirmationCell[] };

function formatDayHeader(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function renderMedConfirmationTable(days: string[], rows: MedConfirmationRow[], generatedAt: Date): string {
  const todayKey = generatedAt.toISOString().slice(0, 10);
  const headerCells = days.map((d) => `<th>${formatDayHeader(d)}</th>`).join("");
  const bodyRows = rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          if (cell.date > todayKey) return `<td class="future">–</td>`;
          return cell.given ? `<td class="given">&#10003;</td>` : `<td class="missed">&#10007;</td>`;
        })
        .join("");
      const label = row.slotName ? `${row.medName} (${row.slotName})` : row.medName;
      return `<tr><td class="medname">${escapeHtml(label)}</td>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="medtable">
      <thead><tr><th></th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="medlegend">&#10003; podáno &nbsp;·&nbsp; &#10007; nepodáno &nbsp;·&nbsp; – zatím neproběhlo</p>`;
}

function incidentMetaLine(inc: EffectiveIncident): string {
  const parts = [CATEGORY_LABELS[inc.category] ?? inc.category, formatDate(inc.incidentDate)];
  if (inc.incidentTime) parts.push(inc.incidentTime);
  if (inc.tempC) parts.push(`${inc.tempC.toString()} °C`);
  if (inc.pillName) parts.push(inc.pillName);
  return parts.join(" · ");
}

function renderIncidentBlock(inc: SummaryIncident): string {
  const followUpsHtml = inc.followUps
    .map(
      (fu) => `
      <div class="followup">
        <div class="meta">${incidentMetaLine(fu)}</div>
        <div class="summary">${escapeHtml(fu.actionSummary)}</div>
        ${fu.details ? `<div class="meta">${escapeHtml(fu.details)}</div>` : ""}
      </div>`
    )
    .join("");

  return `
    <div class="incident">
      <div class="meta">${inc.code ? `<span class="code">${inc.code}</span>` : ""}${incidentMetaLine(inc)}</div>
      <div class="summary">${escapeHtml(inc.actionSummary)}</div>
      ${inc.details ? `<div class="meta">${escapeHtml(inc.details)}</div>` : ""}
      ${followUpsHtml}
    </div>`;
}

function renderBodyMap(label: string, imageDataUri: string, markers: { code: string; xPct: number; yPct: number }[]): string {
  // Same image, ratio and % positions as the app's body map (src/lib/body-map.ts).
  const dots = markers
    .map((m) => {
      const x = (m.xPct / 100) * BODY_MAP_W;
      const y = (m.yPct / 100) * BODY_MAP_H;
      return `
      <circle cx="${x}" cy="${y}" r="${BODY_MAP_DOT_R}" fill="#e05d38" stroke="white" stroke-width="3" />
      <text x="${x}" y="${y + 6}" font-size="16" fill="white" text-anchor="middle" font-weight="bold">${m.code}</text>`;
    })
    .join("");

  return `
    <div class="bodymap-col">
      <svg viewBox="0 0 ${BODY_MAP_W} ${BODY_MAP_H}" width="164" height="${Math.round((164 * BODY_MAP_H) / BODY_MAP_W)}">
        <image href="${imageDataUri}" x="0" y="0" width="${BODY_MAP_W}" height="${BODY_MAP_H}" />
        ${dots}
      </svg>
      <div><span>${label}</span></div>
    </div>`;
}

export function buildParentSummaryHtml(opts: {
  campName: string;
  generatedAt: Date;
  participantName: string;
  groupName: string | null;
  // Place "pdf" of Nastavení akce -> Zdraví -> Zdravotní poznámky, in order.
  notes: { label: string; value: string; highlight: boolean }[];
  incidents: SummaryIncident[];
  medConfirmation: { days: string[]; rows: MedConfirmationRow[] };
  // public/body-map images as data URIs (the PDF renderer can't fetch app URLs).
  bodyMapImages: { front: string; back: string };
}): string {
  const { campName, generatedAt, participantName, groupName, notes, incidents, medConfirmation } = opts;

  const notesHtml = notes.length
    ? `<div class="notes">
        ${notes
          .map((n) => `<p${n.highlight ? ' style="color:#991b1b"' : ""}><strong>${n.highlight ? "⚠ " : ""}${escapeHtml(n.label)}:</strong> ${escapeHtml(n.value)}</p>`)
          .join("")}
      </div>`
    : `<p class="notes">Bez zdravotních poznámek.</p>`;

  const frontMarkers = incidents
    .filter((i) => i.code && i.bodyView === "front" && i.bodyXPct !== null && i.bodyYPct !== null)
    .map((i) => ({ code: i.code!, xPct: Number(i.bodyXPct), yPct: Number(i.bodyYPct) }));
  const backMarkers = incidents
    .filter((i) => i.code && i.bodyView === "back" && i.bodyXPct !== null && i.bodyYPct !== null)
    .map((i) => ({ code: i.code!, xPct: Number(i.bodyXPct), yPct: Number(i.bodyYPct) }));

  const bodyMapsHtml =
    frontMarkers.length + backMarkers.length > 0
      ? `<div class="bodymaps">
          ${renderBodyMap("Přední", opts.bodyMapImages.front, frontMarkers)}
          ${renderBodyMap("Zadní", opts.bodyMapImages.back, backMarkers)}
        </div>`
      : "";

  const incidentsHtml =
    incidents.length > 0
      ? incidents.map(renderIncidentBlock).join("")
      : `<p style="font-size:13px;color:#666;">Zatím žádné záznamy.</p>`;

  const medTableHtml =
    medConfirmation.rows.length > 0
      ? renderMedConfirmationTable(medConfirmation.days, medConfirmation.rows, generatedAt)
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head>
<body>
  <h1>${escapeHtml(campName)}</h1>
  <p class="subtitle">Souhrn zdravotních záznamů · vygenerováno ${formatDate(generatedAt)}</p>

  <h2>${escapeHtml(participantName)}${groupName ? ` — ${escapeHtml(groupName)}` : ""}</h2>
  ${notesHtml}

  ${medTableHtml ? `<h2>Podávání léků</h2>${medTableHtml}` : ""}

  ${bodyMapsHtml ? `<h2>Umístění na těle</h2>${bodyMapsHtml}` : ""}

  <h2>Záznamy</h2>
  ${incidentsHtml}
</body></html>`;
}
