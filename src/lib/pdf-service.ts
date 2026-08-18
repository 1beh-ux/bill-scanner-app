import { GoogleAuth } from "google-auth-library";

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;
const PDF_SECRET = process.env.PDF_SECRET;

export type PdfFormat = "A4" | "A3";

const auth = new GoogleAuth();
let idTokenClientPromise: ReturnType<GoogleAuth["getIdTokenClient"]> | null = null;

// bill-scanner-pdf requires real Cloud Run IAM auth, not just
// --allow-unauthenticated -- the project's org policy blocks public
// (allUsers) invoker bindings, so this app's runtime service account was
// granted roles/run.invoker on it directly instead. An ID token scoped to
// the service's own URL as audience is how a Cloud Run service
// authenticates to another one; the x-pdf-secret header stays on top as a
// second, cheaper-to-check layer.
function getIdTokenClient() {
  if (!idTokenClientPromise) {
    if (!PDF_SERVICE_URL) throw new Error("PDF_SERVICE_URL is not set");
    idTokenClientPromise = auth.getIdTokenClient(PDF_SERVICE_URL);
  }
  return idTokenClientPromise;
}

export async function renderPdf(
  html: string,
  format: PdfFormat,
  landscape = false
): Promise<Buffer> {
  if (!PDF_SERVICE_URL || !PDF_SECRET) {
    throw new Error("PDF service is not configured — PDF_SERVICE_URL and PDF_SECRET must both be set");
  }

  const client = await getIdTokenClient();
  const res = await client.request<ArrayBuffer>({
    url: `${PDF_SERVICE_URL}/render`,
    method: "POST",
    headers: { "x-pdf-secret": PDF_SECRET },
    data: { html, format, landscape },
    responseType: "arraybuffer",
  });

  return Buffer.from(res.data);
}
