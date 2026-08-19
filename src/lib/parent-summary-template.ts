import type { EffectiveIncident } from "@/lib/incident-state";

const CATEGORY_LABELS: Record<string, string> = {
  illness: "Nemoc",
  injury: "Úraz",
  parasite: "Parazit",
  medication: "Medikace",
  other: "Ostatní",
};

// Same schematic humanoid outline as src/components/health/BodyMapPicker.tsx
// -- inline SVG there too, so this string is the literal print-time
// counterpart rather than a new asset.
const BODY_OUTLINE_PATHS = `
  <g fill="#444" stroke="none">
    <line x1="85" y1="188" x2="78" y2="288" stroke="#444" stroke-width="26" stroke-linecap="round" />
    <line x1="78" y1="288" x2="72" y2="384" stroke="#444" stroke-width="20" stroke-linecap="round" />
    <line x1="115" y1="188" x2="122" y2="288" stroke="#444" stroke-width="26" stroke-linecap="round" />
    <line x1="122" y1="288" x2="128" y2="384" stroke="#444" stroke-width="20" stroke-linecap="round" />
    <ellipse cx="70" cy="390" rx="11" ry="7" />
    <ellipse cx="130" cy="390" rx="11" ry="7" />
    <line x1="68" y1="72" x2="44" y2="140" stroke="#444" stroke-width="22" stroke-linecap="round" />
    <line x1="44" y1="140" x2="37" y2="204" stroke="#444" stroke-width="18" stroke-linecap="round" />
    <line x1="132" y1="72" x2="156" y2="140" stroke="#444" stroke-width="22" stroke-linecap="round" />
    <line x1="156" y1="140" x2="163" y2="204" stroke="#444" stroke-width="18" stroke-linecap="round" />
    <circle cx="37" cy="210" r="9" />
    <circle cx="163" cy="210" r="9" />
    <path d="M 66 62 L 134 62 L 128 190 Q 100 202 72 190 Z" />
    <circle cx="100" cy="33" r="25" />
  </g>`;

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

function renderBodyMap(view: "front" | "back", label: string, markers: { code: string; xPct: number; yPct: number }[]): string {
  const dots = markers
    .map(
      (m) => `
      <circle cx="${(m.xPct / 100) * 200}" cy="${(m.yPct / 100) * 400}" r="9" fill="#e05d38" stroke="white" stroke-width="1.5" />
      <text x="${(m.xPct / 100) * 200}" y="${(m.yPct / 100) * 400 + 3.5}" font-size="9" fill="white" text-anchor="middle" font-weight="bold">${m.code}</text>`
    )
    .join("");

  return `
    <div class="bodymap-col">
      <svg viewBox="0 0 200 400" width="180" height="360">
        <rect width="200" height="400" fill="#f5f5f5" rx="8" />
        ${BODY_OUTLINE_PATHS}
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
  allergies: string | null;
  medsNotes: string | null;
  chronicIssues: string | null;
  otherNotes: string | null;
  incidents: SummaryIncident[];
  medConfirmation: { days: string[]; rows: MedConfirmationRow[] };
}): string {
  const { campName, generatedAt, participantName, groupName, allergies, medsNotes, chronicIssues, otherNotes, incidents, medConfirmation } = opts;

  const hasNotes = allergies || medsNotes || chronicIssues || otherNotes;
  const notesHtml = hasNotes
    ? `<div class="notes">
        ${allergies ? `<p><strong>Alergie:</strong> ${escapeHtml(allergies)}</p>` : ""}
        ${medsNotes ? `<p><strong>Léky:</strong> ${escapeHtml(medsNotes)}</p>` : ""}
        ${chronicIssues ? `<p><strong>Chronické potíže:</strong> ${escapeHtml(chronicIssues)}</p>` : ""}
        ${otherNotes ? `<p><strong>Ostatní poznámky:</strong> ${escapeHtml(otherNotes)}</p>` : ""}
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
          ${renderBodyMap("front", "Přední", frontMarkers)}
          ${renderBodyMap("back", "Zadní", backMarkers)}
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
