const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;
const PDF_SECRET = process.env.PDF_SECRET;

export type PdfFormat = "A4" | "A3";

export async function renderPdf(
  html: string,
  format: PdfFormat,
  landscape = false
): Promise<Buffer> {
  if (!PDF_SERVICE_URL || !PDF_SECRET) {
    throw new Error("PDF service is not configured — PDF_SERVICE_URL and PDF_SECRET must both be set");
  }

  const res = await fetch(`${PDF_SERVICE_URL}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pdf-secret": PDF_SECRET,
    },
    body: JSON.stringify({ html, format, landscape }),
  });

  if (!res.ok) {
    throw new Error(`PDF render failed: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
