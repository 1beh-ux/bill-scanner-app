"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { needsPayout } from "@/lib/payout";

// Možné duplicity (src/lib/bill-duplicates.ts): groups of bills that look like one receipt, side by
// side; delete the extra copy, move it to another event, or mark the group "Není duplicita".
type Bill = {
  id: string; eventId: string; status: string; merchantName: string | null; billDate: string | null; totalAmount: number | null; currency: string; amountCzk: number | null;
  originalFilename: string; displayFilename: string | null; hasFile: boolean; notes: string | null; paidToAuthor: boolean; createdAt: string; ingestChannel: string;
  payerAuthor: { canonicalName: string; isOfficialAccount: boolean; payoutNeeded: boolean } | null; event: { name: string }; bankPaired: boolean;
};
type Data = { groups: { reason: string; billIds: string[] }[]; bills: Bill[] };
const btn = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[12.5px] text-ink hover:bg-mist disabled:opacity-50";
const money = (n: number | null, c: string) => (n === null ? "—" : `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === "CZK" ? "Kč" : c}`);

function Duplicates({ id }: { id: string }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const ids = useSearchParams().get("ids") ?? "";
  const [d, setD] = useState<Data | null>(null);
  const [events, setEvents] = useState<{ id: string; name: string; status: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${id}/bills/duplicates${ids ? `?ids=${ids}` : ""}`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, [id, ids]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch(`/api/events?module=bills`).then((r) => (r.ok ? r.json() : [])).then(setEvents).catch(() => {});
  }, []);

  async function remove(b: Bill) {
    const warn = b.bankPaired ? ` ${t("billDup.bankPairedWarn")}` : "";
    if (!(await confirm({ message: t("billModal.deleteConfirm", { name: b.displayFilename ?? b.originalFilename }) + warn, confirmLabel: t("billModal.delete"), danger: true }))) return;
    const r = await fetch(`/api/bills/${b.id}`, { method: "DELETE" });
    if (!r.ok) setMsg(t(`billModal.error.${((await r.json().catch(() => ({}))) as { error?: string }).error}`) || t("billModal.deleteFailed"));
    load();
  }
  async function move(b: Bill, targetEventId: string) {
    const target = events.find((e) => e.id === targetEventId);
    if (!target || !(await confirm({ message: t("billDup.moveConfirm", { name: b.merchantName ?? b.originalFilename, event: target.name }) }))) return;
    const r = await fetch(`/api/events/${b.eventId}/bills/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", billIds: [b.id], targetEventId }) });
    const res = await r.json().catch(() => ({}));
    setMsg(r.ok && !res.failedCount ? t("billDup.moved", { event: target.name }) : t("billDup.moveFailed"));
    load();
  }
  async function dismiss(billIds: string[]) {
    await fetch(`/api/events/${id}/bills/duplicates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billIds }) });
    load();
  }

  const byId = new Map(d?.bills.map((b) => [b.id, b]));
  return (
    <div className="mx-auto max-w-[1300px] p-4 md:p-8">
      <a href={`/events/${id}/bills`} className="text-[13px] text-ink-secondary hover:text-ink">← {t("billsPage.title")}</a>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("billDup.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{ids ? t("billDup.hintSelected", { count: String(ids.split(",").length) }) : t("billDup.hintAll")}</p>
      {msg && <p className="mb-3 text-[13px] text-ink">{msg}</p>}
      {!d ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : d.groups.length === 0 ? (
        <p className="text-[14px] text-pine">{t("billDup.none")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {d.groups.map((g) => (
            <section key={g.billIds.join()} className="rounded-lg border border-mist p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink">{t(`billDup.reason.${g.reason}`)}</span>
                <button type="button" className={btn} onClick={() => dismiss(g.billIds)}>{t("billDup.notDuplicate")}</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.billIds.map((bid) => byId.get(bid)).filter((b): b is Bill => !!b).map((b) => {
                  const isPdf = b.originalFilename.toLowerCase().endsWith(".pdf");
                  return (
                    <div key={b.id} className="flex flex-col gap-1.5 rounded-lg border border-mist bg-paper-2 p-2 text-[12.5px]">
                      {b.hasFile && !isPdf ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated bill file
                        <img src={`/api/bills/${b.id}/file`} alt={b.originalFilename} className="h-40 w-full rounded bg-paper object-contain" />
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded bg-paper text-ink-secondary">{b.hasFile ? "PDF" : t("missingDoc.badge")}</div>
                      )}
                      <a href={`/events/${b.eventId}/bills/${b.id}`} target="_blank" rel="noreferrer" className="font-medium text-ember hover:underline">{b.merchantName ?? b.displayFilename ?? b.originalFilename}</a>
                      <span className="text-ink">
                        {b.billDate ? new Date(b.billDate).toLocaleDateString("cs-CZ") : "—"} · {money(b.totalAmount, b.currency)}
                        {b.currency !== "CZK" && ` (${money(b.amountCzk, "CZK")})`}
                      </span>
                      <span className="text-ink-secondary">
                        {t(`billsPage.status${b.status === "auto_approved" ? "AutoApproved" : b.status === "to_review" ? "ToReview" : b.status.charAt(0).toUpperCase() + b.status.slice(1)}`)}
                        {` · ${b.payerAuthor?.canonicalName ?? t("billsPage.payerEventShort")}`}
                        {needsPayout(b.payerAuthor) && ` · ${t(b.paidToAuthor ? "billsPage.paidYes" : "billsPage.paidNo")}`}
                        {b.bankPaired && ` · ${t("paymentState.bank")}`}
                      </span>
                      <span className="text-ink-secondary [overflow-wrap:anywhere]">{b.originalFilename} · {new Date(b.createdAt).toLocaleDateString("cs-CZ")}</span>
                      {b.eventId !== id && <span className="text-amber-700">{t("billDup.otherEvent", { event: b.event.name })}</span>}
                      {b.notes && <span className="text-ink-secondary">{b.notes.slice(0, 120)}</span>}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                        <button type="button" className="rounded-lg border border-red-300 px-2.5 py-1 text-[12.5px] text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={b.status === "approved" || b.status === "queued" || b.status === "processing"} title={b.status === "approved" ? t("billDup.approvedHint") : undefined} onClick={() => remove(b)}>{t("billModal.delete")}</button>
                        <select defaultValue="" onChange={(e) => { if (e.target.value) move(b, e.target.value); e.target.value = ""; }} className="rounded-lg border border-mist bg-paper px-2 py-1 text-[12.5px]" disabled={b.status === "approved"}>
                          <option value="">{t("billDup.moveTo")}</option>
                          {events.filter((e) => e.id !== b.eventId && e.status === "active").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Duplicates id={id} />
    </Suspense>
  );
}
