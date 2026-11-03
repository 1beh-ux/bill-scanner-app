// Test stand-in for src/lib/pdf-service.ts (scripts/test-travel-orders.ts --stub, tsconfig.travel-test.json):
// the HTML is kept for the test to read, the "PDF" is a few bytes.
export type PdfFormat = "A4" | "A3";
export async function renderPdf(html: string): Promise<Buffer> {
  (globalThis as { __lastPdfHtml?: string }).__lastPdfHtml = html;
  return Buffer.from(`%PDF-1.4 stub ${html.length}`);
}
