// Kuchyně AI import: a recipe document to the AI service's /recipe (Gemini), metered like the bills.
import { getIdToken } from "@/lib/ai-extraction";
import { recordAiUsage, type AiMeter } from "@/lib/ai-usage";
import type { RawRecipe } from "./import-normalize";
import { docxText, xlsxText } from "./office-text";

export type AiRecipe = RawRecipe & { ingredients: (RawRecipe["ingredients"][number] & { allergens?: unknown })[] };
const MEDIA: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Null = a file type the import doesn't read. */
export function importKind(filename: string): "file" | "docx" | "xlsx" | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MEDIA[ext] ? "file" : ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : null;
}

export async function readRecipes(buf: Buffer, filename: string, meter: AiMeter): Promise<{ recipes: AiRecipe[]; notes: string | null } | { error: string }> {
  const url = process.env.AI_SERVICE_URL;
  const kind = importKind(filename);
  if (!url) return { error: "ai_unavailable" };
  if (!kind) return { error: "unsupported_file" };
  const form = new FormData();
  if (kind === "file") form.append("file", new Blob([Uint8Array.from(buf)], { type: MEDIA[filename.toLowerCase().split(".").pop()!] }), filename);
  else {
    const text = kind === "docx" ? docxText(buf) : xlsxText(buf);
    if (!text.trim()) return { error: "empty_file" };
    form.append("text", text);
  }
  let body: { status?: string; recipes?: AiRecipe[]; notes?: string | null; model?: string; usage?: { prompt_tokens?: number; output_tokens?: number; thinking_tokens?: number } | null } | null = null;
  try {
    const token = await getIdToken();
    const res = await fetch(`${url}/recipe`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(120_000) });
    body = await res.json().catch(() => null);
    if (!res.ok || body?.status !== "OK") return { error: "ai_failed" };
    return { recipes: Array.isArray(body.recipes) ? body.recipes : [], notes: body.notes ?? null };
  } catch {
    return { error: "ai_failed" };
  } finally {
    const u = body?.usage;
    await recordAiUsage(meter, { model: body?.model ?? "unknown", input: u?.prompt_tokens ?? 0, output: u?.output_tokens ?? 0, thinking: u?.thinking_tokens ?? 0 }, body?.status === "OK");
  }
}
