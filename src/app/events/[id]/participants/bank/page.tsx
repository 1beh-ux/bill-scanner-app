"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { formatCzk } from "@/lib/format";

type Movement = {
  id: string;
  bookedAt: string;
  amount: number;
  currency: string;
  variableSymbol: string | null;
  counterName: string | null;
  counterAccount: string | null;
  message: string | null;
  status: "settled" | "review" | "ignored";
  reason: string | null;
  participantId: string | null;
  participantName: string | null;
  decidedBy: string | null;
};
type Data = { movements: Movement[]; participants: { id: string; name: string; acceptedVariableSymbol: string | null }[] };

const date = (d: string) => new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const link = "text-[13px] text-ember hover:underline disabled:opacity-50";

// "Platby z banky" (docs/bank-payments-design.md): incoming payments the automatic check
// couldn't settle (K vyřešení: assign to a participant or ignore) and the decided ones (Spárované).
// Reached from the roster / Pošta -> Dokumenty when the event checks the bank.
export default function BankPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"review" | "done">("review");
  const [assigning, setAssigning] = useState<{ movementId: string; participantId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${id}/bank-movements`)
      .then((r) => (r.ok ? r.json() : { movements: [], participants: [] }))
      .then(setData)
      .catch(() => setData({ movements: [], participants: [] }));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(movementId: string, action: "assign" | "ignore", participantId?: string) {
    setError(null);
    const res = await fetch(`/api/events/${id}/bank-movements/${movementId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      return setError(t(`bankPayments.error.${body?.error ?? "failed"}`));
    }
    setAssigning(null);
    load();
  }

  const shown = (data?.movements ?? []).filter((m) => (tab === "review" ? m.status === "review" : m.status !== "review"));

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <a href={`/events/${id}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.centralTitle")}
      </a>
      <h1 className="mb-2 mt-2 text-[22px] font-semibold text-ink">{t("bankPayments.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("bankPayments.hint")}</p>
      <div className="mb-4 flex gap-2" role="tablist">
        {(["review", "done"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={"rounded-full px-3 py-1 text-[13px] " + (tab === k ? "bg-ember text-white" : "bg-paper-2 text-ink-secondary hover:text-ink")}
          >
            {t(`bankPayments.tab.${k}`)} ({(data?.movements ?? []).filter((m) => (k === "review" ? m.status === "review" : m.status !== "review")).length})
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {!data ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t(`bankPayments.empty.${tab}`)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 rounded-lg border border-mist bg-paper px-3 py-2 text-[14px]">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">
                  {m.currency === "CZK" ? formatCzk(m.amount) : `${m.amount} ${m.currency}`}
                  <span className="ml-2 text-[12.5px] font-normal text-ink-secondary">VS {m.variableSymbol ?? "—"}</span>
                </span>
                <span className="text-[12.5px] text-ink-secondary">{date(m.bookedAt)}</span>
              </span>
              <span className="text-[13px] text-ink-secondary [overflow-wrap:anywhere]">
                {[m.counterName, m.counterAccount, m.message].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="text-[13px]">
                {m.status === "settled" ? (
                  <span className="text-pine">{t("bankPayments.settledTo", { name: m.participantName ?? "—" })}</span>
                ) : m.status === "ignored" ? (
                  <span className="text-ink-secondary">{t("bankPayments.ignored")}</span>
                ) : null}
                {m.reason && (
                  <span className="ml-0 text-amber-700">
                    {m.status !== "review" && " · "}
                    {t(`bankPayments.reason.${m.reason}`)}
                    {m.participantName && m.status === "review" && ` (${m.participantName})`}
                  </span>
                )}
                {m.decidedBy && <span className="text-ink-secondary"> · {t("bankPayments.decidedBy", { name: m.decidedBy })}</span>}
              </span>
              {m.status === "review" &&
                (assigning?.movementId === m.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <select
                      value={assigning.participantId}
                      onChange={(e) => setAssigning({ movementId: m.id, participantId: e.target.value })}
                      className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink"
                    >
                      <option value="">{t("bankPayments.pickParticipant")}</option>
                      {data.participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.acceptedVariableSymbol ? ` (VS ${p.acceptedVariableSymbol})` : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" className={link} disabled={!assigning.participantId} onClick={() => act(m.id, "assign", assigning.participantId)}>
                      {t("bankPayments.assign")}
                    </button>
                    <button type="button" className="text-[13px] text-ink-secondary hover:underline" onClick={() => setAssigning(null)}>
                      {t("common.cancel")}
                    </button>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-3">
                    <button type="button" className={link} onClick={() => setAssigning({ movementId: m.id, participantId: m.participantId ?? "" })}>
                      {t("bankPayments.assignToParticipant")}
                    </button>
                    <button type="button" className={link} onClick={() => act(m.id, "ignore")}>
                      {t("bankPayments.ignore")}
                    </button>
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
