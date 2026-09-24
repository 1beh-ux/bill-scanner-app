// Schedule as a standalone HTML document -- one layout for the PDF download
// (via the PDF service), the print page's preview and browser printing.
// Parallel blocks sit side by side in their time row. Pure; Czech copy is
// inline like the other generated PDFs (med-report-templates.ts).

import type { ScheduleDay, ScheduleRow } from "@/lib/planning-export";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"][d.getUTCDay()];
  return `${weekday} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
}

// Colors come from user-edited list data and land in a style attribute the PDF
// service renders -- hex only, so nothing like url(...) gets through.
const safeColor = (c: string | null) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#9ca3af");

// Split color mark as hard-stop gradient segments (same weights as the board).
function markGradient(segments: { color: string; weight: number }[]): string {
  if (segments.length === 0) return safeColor(null);
  const total = segments.reduce((n, s) => n + s.weight, 0);
  let at = 0;
  const stops = segments.map((s) => {
    const from = (at / total) * 100;
    at += s.weight;
    return `${safeColor(s.color)} ${from.toFixed(1)}% ${((at / total) * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function branch(b: ScheduleRow, showLeader: boolean): string {
  const meta = [showLeader && b.leader, b.location, b.groups].filter(Boolean).map((x) => esc(String(x)));
  return `<div class="b"><div class="mark" style="background:${markGradient(b.mainSegments)}"></div>
  <div class="n">${esc(b.activity)}</div>
  ${meta.length ? `<div class="m">${meta.join(" · ")}</div>` : ""}
  ${b.description ? `<div class="d">${esc(b.description)}</div>` : ""}
  ${b.notes ? `<div class="d i">${esc(b.notes)}</div>` : ""}
</div>`;
}

export function scheduleHtml(opts: { eventName: string; days: ScheduleDay[]; subtitle?: string; showLeader: boolean }): string {
  const pages = opts.days
    .map((day) => {
      const rows = day.windows
        .map(
          (w) => `<tr><td colspan="2" class="w">${esc(w.name)} <span>${w.start}–${w.end}</span></td></tr>
${w.slots
  .map(
    (s) => `<tr><td class="t">${s.start}–${s.end}<div>${s.durationMin} min</div></td>
<td><div class="row">${s.branches.map((b) => branch(b, opts.showLeader)).join("")}</div></td></tr>`
  )
  .join("\n")}`
        )
        .join("\n");
      return `<section>
<h1>${esc(opts.eventName)} — ${esc(day.label)}</h1>
<p class="sub">${[formatDate(day.date), day.theme, opts.subtitle].filter(Boolean).map((x) => esc(String(x))).join(" · ")}</p>
${rows ? `<table>${rows}</table>` : `<p class="empty">Na tento den není nic naplánováno.</p>`}
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><title>${esc(opts.eventName)}</title><style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; font-size: 10pt; }
  section { break-after: page; }
  section:last-child { break-after: auto; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { color: #555; margin: 0 0 3mm; }
  table { width: 100%; border-collapse: collapse; }
  tr { break-inside: avoid; }
  td { border-bottom: 0.5pt solid #ddd; padding: 1.5mm; vertical-align: top; }
  td.w { background: #eef0f3; font-weight: 600; text-transform: uppercase; font-size: 8.5pt; letter-spacing: .03em; color: #444; padding-top: 2.5mm; }
  td.w span { font-weight: 400; text-transform: none; }
  td.t { width: 22mm; white-space: nowrap; font-weight: 600; }
  td.t div { font-weight: 400; color: #666; font-size: 8.5pt; }
  .row { display: flex; gap: 2mm; }
  .b { position: relative; flex: 1 1 0; min-width: 0; border: 0.5pt solid #ccc; border-radius: 1.5mm; padding: 1.2mm 2mm 1.2mm 3.5mm; overflow: hidden; }
  .mark { position: absolute; left: 0; top: 0; bottom: 0; width: 2.5pt; }
  .b { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .n { font-weight: 600; }
  .m { color: #444; font-size: 8.5pt; }
  .d { color: #555; font-size: 8.5pt; margin-top: .5mm; }
  .i { font-style: italic; }
  .empty { color: #666; }
</style></head><body>
${pages}
</body></html>`;
}
