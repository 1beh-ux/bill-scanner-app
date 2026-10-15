"use client";

import { useEffect, useState } from "react";
import { storageCostUsd, type GcpPrices } from "@/lib/gcp-prices";

// Nastavení akce -> Akce: the event's AI + storage cost, super-admin only (the caller checks,
// /api/usage/costs answers 403 to anyone else anyway). All time.
type T = (key: string, vars?: Record<string, string>) => string;
type Data = { prices: GcpPrices; totals: { aiCost: number; aiCalls: number; unpriced: number }; storageKind: { bytes: number }[] };

export default function EventCostCard({ eventId, t }: { eventId: string; t: T }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch(`/api/usage/costs?event=${eventId}&days=0`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, [eventId]);
  if (!d) return null;
  const bytes = d.storageKind.reduce((n, s) => n + s.bytes, 0);
  const storage = storageCostUsd(d.prices, bytes);
  const usd = (n: number) => `$${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="max-w-md rounded-lg border border-mist bg-paper-2 p-4">
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("usage.eventCard")}</h3>
      <p className="text-[20px] font-semibold text-ink">{usd(d.totals.aiCost + (storage ?? 0))}</p>
      <p className="text-[12.5px] text-ink-secondary">
        {t("usage.eventCardDetail", { ai: usd(d.totals.aiCost), calls: String(d.totals.aiCalls), gb: (bytes / 2 ** 30).toLocaleString("cs-CZ", { maximumFractionDigits: 2 }), storage: storage === null ? t("usage.priceNotSet") : usd(storage) })}
      </p>
      <a href={`/vyuziti?tab=costs&event=${eventId}&days=0`} className="mt-1 inline-block text-[13px] text-ember hover:underline">{t("usage.eventCardLink")}</a>
    </div>
  );
}
