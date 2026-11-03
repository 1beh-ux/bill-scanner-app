"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import HelpLink from "@/components/HelpLink";

// Účtenky -> Cestovní příkazy: the event's travel orders (drafts and submitted), Nový cestovní příkaz.
type Row = {
  id: string;
  status: "draft" | "submitted";
  workerName: string | null;
  startAt: string | null;
  endAt: string | null;
  totalAmount: string | null;
  purpose: string | null;
  billId: string | null;
  bill: { status: string; paidToAuthor: boolean } | null;
};
const STATUS_KEY: Record<string, string> = { new: "statusNew", queued: "statusQueued", processing: "statusProcessing", auto_approved: "statusAutoApproved", to_review: "statusToReview", failed: "statusFailed", approved: "statusApproved" };
const wall = (s: string | null) => (s ? `${new Date(s).getUTCDate()}. ${new Date(s).getUTCMonth() + 1}. ${s.slice(11, 16)}` : "");

export default function TravelOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/travel-orders`).catch(() => null);
    setRows(res?.ok ? await res.json() : []);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    const res = await fetch(`/api/events/${id}/travel-orders`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.push(`/events/${id}/travel-orders/${(await res.json()).id}`);
  }

  const count = rows?.length ?? 0;
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="flex items-center gap-2">
        <h1 className="text-[22px] font-semibold text-ink">{t("travelOrders.title")}</h1>
        <HelpLink slug="cestovni-prikazy" />
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("travelOrders.hint")}</p>
      <div className="mb-3 flex items-center gap-3">
        <button type="button" disabled={busy} onClick={create} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          + {t("travelOrders.new")}
        </button>
        {rows && <span className="text-[13px] text-ink-secondary">{t(`travelOrders.count.${pluralForm(count, lang)}`, { count: String(count) })}</span>}
      </div>
      {!rows ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("travelOrders.none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full text-[13px]">
            <thead className="bg-paper-2 text-left text-ink-secondary">
              <tr>
                <th className="p-2">{t("travelOrders.worker")}</th>
                <th className="p-2">{t("travelOrders.dates")}</th>
                <th className="p-2">{t("travelOrders.purpose")}</th>
                <th className="p-2 text-right">{t("travelOrders.total")}</th>
                <th className="p-2">{t("travelOrders.status")}</th>
                <th className="p-2">{t("travelOrders.billStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-mist hover:bg-paper-2" onClick={() => router.push(`/events/${id}/travel-orders/${r.id}`)}>
                  <td className="p-2">
                    <a href={`/events/${id}/travel-orders/${r.id}`} className="text-ember hover:underline">
                      {r.workerName || t("travelOrders.noWorker")}
                    </a>
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {wall(r.startAt)} – {wall(r.endAt)}
                  </td>
                  <td className="p-2 text-ink-secondary">{r.purpose}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{r.totalAmount ? `${Number(r.totalAmount).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč` : "—"}</td>
                  <td className="p-2">
                    <span className={"rounded-full px-2 py-0.5 text-[12px] " + (r.status === "submitted" ? "bg-pine-bg text-pine" : "bg-paper-2 text-ink-secondary")}>{t(`travelOrders.statusValue.${r.status}`)}</span>
                  </td>
                  <td className="p-2 text-ink-secondary">{r.bill ? `${t(`billsPage.${STATUS_KEY[r.bill.status] ?? "statusToReview"}`)}${r.bill.paidToAuthor ? ` · ${t("travelOrders.paid")}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
