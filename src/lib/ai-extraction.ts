import { GoogleAuth } from "google-auth-library";
import { billsBucket } from "@/lib/gcs";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_ATTEMPTS = 3;

export interface AiExtractionData {
  merchant_name: string | null;
  merchant_ico: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  currency: string | null;
  line_items: { description: string | null; total: number | null }[];
  category: string | null;
  category_confidence: number;
  category_notes: string | null;
  confidence: number;
  notes: string | null;
}

export interface AiExtractionResult {
  status: "AUTO_APPROVE" | "NEEDS_REVIEW" | "FAILED";
  data: AiExtractionData;
  request_id: string;
  processor_version: string;
}

function mimeTypeForFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads a bill's bytes from GCS, retrying on failure. Cloud Shell's
 * network path to GCS has shown occasional transient hangs (confirmed on
 * both AI extraction and unrelated file-preview requests, so this isn't
 * specific to this pipeline) — but a fresh retry has consistently succeeded
 * quickly, so retrying automatically here removes the need for a human to
 * notice a failure and manually click try-again.
 */
async function downloadWithRetry(gcsObjectPath: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[ai-extraction] step 0: downloading from GCS (attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS})`,
        gcsObjectPath
      );
      const [buffer] = await withTimeout(
        billsBucket.file(gcsObjectPath).download(),
        REQUEST_TIMEOUT_MS,
        "GCS download"
      );
      console.log("[ai-extraction] step 0 done:", buffer.length, "bytes");
      return buffer;
    } catch (err) {
      lastError = err;
      console.log(`[ai-extraction] step 0 attempt ${attempt} failed:`, String(err));
      if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
        await sleep(1000);
      }
    }
  }
  throw lastError;
}

let cachedAuth: GoogleAuth | null = null;

async function getIdToken(): Promise<string> {
  if (!AI_SERVICE_URL) throw new Error("AI_SERVICE_URL is not set");
  console.log("[ai-extraction] step 1: fetching ID token for audience", AI_SERVICE_URL);
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth();
  }
  const client = await cachedAuth.getIdTokenClient(AI_SERVICE_URL);
  const token = await client.idTokenProvider.fetchIdToken(AI_SERVICE_URL);
  console.log("[ai-extraction] step 1 done: got ID token, length", token?.length ?? 0);
  return token;
}

export async function extractBillWithAi(
  gcsObjectPath: string,
  originalFilename: string,
  categories: { name: string; description: string | null }[]
): Promise<AiExtractionResult> {
  if (!AI_SERVICE_URL) throw new Error("AI_SERVICE_URL is not set");

  const buffer = await downloadWithRetry(gcsObjectPath);

  const mimeType = mimeTypeForFilename(originalFilename);
  const idToken = await withTimeout(getIdToken(), REQUEST_TIMEOUT_MS, "ID token fetch");

  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(buffer)], { type: mimeType }), originalFilename);
  form.append(
    "categories",
    JSON.stringify(categories.map((c) => ({ name: c.name, description: c.description })))
  );

  console.log("[ai-extraction] step 2: calling", `${AI_SERVICE_URL}/extract`);
  const res = await withTimeout(
    fetch(`${AI_SERVICE_URL}/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    }),
    REQUEST_TIMEOUT_MS,
    "extract request"
  );
  console.log("[ai-extraction] step 2 done: response status", res.status);

  const result = (await res.json()) as AiExtractionResult;

  if (!res.ok && result?.status !== "FAILED") {
    throw new Error(`AI service returned unexpected HTTP ${res.status}`);
  }

  return result;
}