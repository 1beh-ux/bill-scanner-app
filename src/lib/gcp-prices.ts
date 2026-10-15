// "Ceny GCP" (/vyuziti, super-admin): USD list prices for cost estimates, AppSetting "gcpPrices".
// Pure + client-safe; reading/writing the setting lives in src/lib/ai-usage.ts.
export type GcpPrices = {
  // Per model, USD per 1M tokens; thinking tokens are billed at the output price.
  models: Record<string, { input: number | null; output: number | null }>;
  // Cloud Storage, USD per GB-month.
  gcsGbMonth: number | null;
};

export const EMPTY_PRICES: GcpPrices = { models: {}, gcsGbMonth: null };

/** costUsd = input × inPrice/1e6 + (output + thinking) × outPrice/1e6; null = no price for the model. */
export function aiCostUsd(prices: GcpPrices, model: string, t: { input: number; output: number; thinking: number }): number | null {
  const p = prices.models[model];
  if (!p || p.input == null || p.output == null) return null;
  return (t.input * p.input + (t.output + t.thinking) * p.output) / 1e6;
}

/** Monthly storage cost of `bytes`; null = no price. GCS bills per GiB (2^30 bytes). */
export const storageCostUsd = (prices: GcpPrices, bytes: number) => (prices.gcsGbMonth == null ? null : (bytes / 2 ** 30) * prices.gcsGbMonth);

/** A settings body from the page -> prices, or null if malformed. */
export function parsePrices(v: unknown): GcpPrices | null {
  const o = v as GcpPrices;
  const n = (x: unknown) => (x === null || x === "" || x === undefined ? null : typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : NaN);
  if (!o || typeof o !== "object" || typeof o.models !== "object" || !o.models) return null;
  const models: GcpPrices["models"] = {};
  for (const [name, p] of Object.entries(o.models)) {
    if (!/^[\w.\-]{1,80}$/.test(name) || !p) return null;
    const input = n(p.input), output = n(p.output);
    if (Number.isNaN(input) || Number.isNaN(output)) return null;
    models[name] = { input, output };
  }
  const gcs = n(o.gcsGbMonth);
  return Number.isNaN(gcs) ? null : { models, gcsGbMonth: gcs };
}
