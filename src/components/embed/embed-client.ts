// Embed mode helpers (docs/custom-domain.md "Embedding"), client only.

/** Ask the embedding page to scroll the frame into view (after submit, errors, page changes). */
export function postScrollTop() {
  if (typeof window !== "undefined" && window.parent !== window) window.parent.postMessage({ type: "tabornik:scrollTop" }, "*");
}

// Inside an iframe the gate cookie is blocked / partitioned: the signed gate value is kept per
// token in sessionStorage and sent as x-portal-gate (src/lib/portal-server.ts portalScope).
const gateKey = (token: string) => `tabornik-gate:${token}`;

export function storeGate(token: string, value: string) {
  try {
    sessionStorage.setItem(gateKey(token), value);
  } catch {}
}

export function gateHeaders(token: string): Record<string, string> {
  try {
    const v = sessionStorage.getItem(gateKey(token));
    return v ? { "x-portal-gate": v } : {};
  } catch {
    return {};
  }
}

/** fetch for /api/portal/<token>/…: adds the stored gate value when there is one. */
export const portalFetch = (token: string) => (url: string, init?: RequestInit) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), ...gateHeaders(token) } });

/** fetch for a /api/portal/<token>/… URL, with the stored gate value of that token. */
export function portalApiFetch(url: string, init?: RequestInit) {
  return portalFetch(url.split("/")[3] ?? "")(url, init);
}
