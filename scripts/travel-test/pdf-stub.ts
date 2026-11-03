// Test stand-in for src/lib/pdf-service.ts (scripts/test-travel-orders.ts, tsconfig.travel-test.json): the HTML is
// kept for the test to read (and written to $TRAVEL_HTML_OUT/order-N.html when set), the "PDF" is a few bytes.
import fs from "node:fs";
export type PdfFormat = "A4" | "A3";
let n = 0;
export async function renderPdf(html: string): Promise<Buffer> {
  (globalThis as { __lastPdfHtml?: string }).__lastPdfHtml = html;
  if (process.env.TRAVEL_HTML_OUT) fs.writeFileSync(`${process.env.TRAVEL_HTML_OUT}/order-${++n}.html`, html);
  return Buffer.from(`%PDF-1.4 stub ${html.length}`);
}
