// Client side of POST /api/events/[id]/drive-export: one call uploads for at most a few minutes and
// says `partial` when files are left, so keep calling until done. Counts add up across the calls.
export type ExportSummary = {
  totalApproved: number;
  newlyExported: number;
  alreadyExported: number;
  exportFailures: { filename: string; error: string }[];
  manifestSpreadsheetId: string;
  partial?: boolean;
  remaining?: number;
};

export async function runDriveExport(
  eventId: string,
  recreateManifest: boolean,
  onProgress: (done: number, remaining: number) => void
): Promise<{ ok: true; data: ExportSummary } | { ok: false; data: Record<string, string> }> {
  let uploaded = 0;
  for (let first = true; ; first = false) {
    const res = await fetch(`/api/events/${eventId}/drive-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recreateManifest: first && recreateManifest }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return { ok: false, data: data ?? {} };
    uploaded += data.newlyExported;
    // Earlier rounds' uploads count as "already there" in the last one.
    // Stop on failures too: they'd only repeat on every round.
    if (!data.partial || data.exportFailures.length) {
      return { ok: true, data: { ...data, newlyExported: uploaded, alreadyExported: data.alreadyExported - (uploaded - data.newlyExported) } };
    }
    onProgress(uploaded, data.remaining);
  }
}
