"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Result = { status: "ok"; settled: number; review: number } | { status: "nothing_to_do" | "throttled" | "off" } | { status: "error"; code: string };

/**
 * "Zkontrolovat platby" (docs/bank-payments-design.md): roster and Pošta -> Dokumenty,
 * only when the event checks the bank. Runs once on page open; onSettled reloads the list.
 */
export default function BankCheckButton({ eventId, onSettled, t }: { eventId: string; onSettled: () => void; t: (key: string, vars?: Record<string, string>) => string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Refs, so a new `t` / callback identity never re-runs the on-open check.
  const settled = useRef(onSettled);
  const tr = useRef(t);
  useEffect(() => {
    settled.current = onSettled;
    tr.current = t;
  });

  const run = useCallback(async (quiet: boolean) => {
    setBusy(true);
    const r: Result | null = await fetch(`/api/events/${eventId}/bank-check`, { method: "POST" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setBusy(false);
    if (r?.status === "ok" && r.settled > 0) settled.current();
    // On page open only news is worth a line.
    if (quiet && !(r?.status === "ok" && r.settled > 0) && r?.status !== "error") return;
    const t = tr.current;
    setMessage(
      !r ? t("bankCheck.result.error", { problem: t("bankCheck.error.unreachable") })
        : r.status === "ok" ? (r.settled > 0 ? t("bankCheck.result.settled", { count: String(r.settled) }) : t("bankCheck.result.nothingNew"))
        : r.status === "throttled" ? t("bankCheck.result.throttled")
        : r.status === "error" ? t("bankCheck.result.error", { problem: t(`bankCheck.error.${r.code}`) })
        : t("bankCheck.result.nothingNew")
    );
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the on-open check (a fetch)
    run(true);
  }, [run]);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => run(false)} disabled={busy} className="rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50">
        {t("bankCheck.button")}
      </button>
      <a href={`/events/${eventId}/participants/bank`} className="text-[13px] text-ember hover:underline">
        {t("bankPayments.title")} →
      </a>
      {message && <span className="text-[12.5px] text-ink-secondary">{message}</span>}
    </span>
  );
}
