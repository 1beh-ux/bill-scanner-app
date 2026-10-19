// The tickets PDF (docs/public-event-tickets-spec.md): the event's ticket template (markdown, the
// TICKET_DOCUMENT e-mail template body) once per ticket, one A4 page each, rendered by the PDF service.
// Markdown never passes raw HTML through (micromark default), and the values go in before it, so a
// buyer's name can't inject markup; {{ticket_qr}} becomes the QR image afterwards.
import { micromark } from "micromark";
import QRCode from "qrcode";
import { substituteVariables } from "@/lib/email-template";
import { renderPdf } from "@/lib/pdf-service";

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; }
  .ticket { padding: 18mm 16mm; page-break-after: always; font-size: 14px; line-height: 1.5; }
  .ticket:last-child { page-break-after: auto; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 18px 0 8px; }
  h3 { font-size: 16px; margin: 14px 0 6px; }
  p { margin: 0 0 8px; }
  img.qr { width: 60mm; height: 60mm; display: block; margin: 10px 0; }
`;

/** Markdown text with {{vars}} -> HTML; "{{ticket_qr}}" (a line of its own) -> the given image. */
export function ticketPageHtml(template: string, vars: Record<string, string>, qrDataUrl: string): string {
  // Markdown specials in values would format them ("*", "_" in a name); a backslash keeps them literal.
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v.replace(/([\\`*_[\]#<>|~])/g, "\\$1")]));
  const html = micromark(substituteVariables(template, { ...safe, ticket_qr: "TICKETQRPLACEHOLDER" }));
  const img = `<img class="qr" src="${qrDataUrl}" alt="">`;
  return html.replace(/<p>TICKETQRPLACEHOLDER<\/p>/g, img).replace(/TICKETQRPLACEHOLDER/g, img);
}

export const ticketQrDataUrl = (code: string) => QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: 480 });

/** One PDF, a page per ticket: its template variables + the code its QR holds. */
export async function renderTicketsPdf(template: string, pages: { vars: Record<string, string>; code: string }[]): Promise<Buffer> {
  const sections = await Promise.all(pages.map(async (p) => `<section class="ticket">${ticketPageHtml(template, p.vars, await ticketQrDataUrl(p.code))}</section>`));
  return renderPdf(`<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${sections.join("")}</body></html>`, "A4");
}
