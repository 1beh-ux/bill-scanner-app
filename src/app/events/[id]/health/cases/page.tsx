"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { participantListName } from "@/lib/participant-name";
import IncidentDetailModal from "@/components/health/IncidentDetailModal";
import type { IncidentClientData } from "@/components/health/IncidentFormModal";

// Zdraví -> Aktivní případy (2026-10-29): every case still open (top-level incident + its follow-ups),
// "Vyřešeno" to close one; filter by child, show resolved / all; "+ Nový případ" with picking the child.
type Case = IncidentClientData & {
  participantId: string;
  resolvedAt: string | null;
  participant: { id: string; name: string; firstName: string | null; lastName: string | null; groupName: string | null };
  followUps: IncidentClientData[];
};
type Kid = { id: string; name: string; firstName: string | null; lastName: string | null };

const btn = "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const select = "rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink";

function meta(inc: IncidentClientData) {
  return [new Date(inc.incidentDate).toLocaleDateString("cs-CZ"), inc.incidentTime, inc.tempC && `${inc.tempC} °C`, inc.pillName].filter(Boolean).join(" · ");
}

export default function HealthCasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const router = useRouter();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [status, setStatus] = useState<"active" | "resolved" | "all">("active");
  const [participantId, setParticipantId] = useState("");
  const [newFor, setNewFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ inc: IncidentClientData; participantId: string } | null>(null);
  const [ready, setReady] = useState(false);

  // ?participantId= / ?status= (the Zdraví list's pills link here).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("status");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once
    if (s === "resolved" || s === "all") setStatus(s);
    setParticipantId(q.get("participantId") ?? "");
    setReady(true);
    fetch(`/api/events/${id}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Kid[]) => setKids([...list].sort((a, b) => participantListName(a).localeCompare(participantListName(b), "cs"))))
      .catch(() => setKids([]));
  }, [id]);

  const load = useCallback(async () => {
    if (!ready) return;
    const q = new URLSearchParams({ status, ...(participantId ? { participantId } : {}) });
    history.replaceState(null, "", `?${q}`);
    const res = await fetch(`/api/events/${id}/incidents?${q}`).catch(() => null);
    setCases(res?.ok ? await res.json() : []);
  }, [id, status, participantId, ready]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads on a filter change
    load();
  }, [load]);

  async function setResolved(c: Case, resolved: boolean) {
    await fetch(`/api/incidents/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved }) }).catch(() => null);
    load();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <a href={`/events/${id}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("healthPage.title")}
      </a>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("healthCases.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("healthCases.hint")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select} aria-label={t("healthCases.status")}>
          <option value="active">{t("healthCases.statusActive")}</option>
          <option value="resolved">{t("healthCases.statusResolved")}</option>
          <option value="all">{t("healthCases.statusAll")}</option>
        </select>
        <select value={participantId} onChange={(e) => setParticipantId(e.target.value)} className={select} aria-label={t("healthCases.participant")}>
          <option value="">{t("healthCases.allParticipants")}</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {participantListName(k)}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {newFor === null ? (
          <button type="button" onClick={() => setNewFor(participantId)} className={btnPrimary}>
            + {t("healthCases.new")}
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <select autoFocus value={newFor} onChange={(e) => setNewFor(e.target.value)} className={select} aria-label={t("healthCases.pickChild")}>
              <option value="">{t("healthCases.pickChild")}</option>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {participantListName(k)}
                </option>
              ))}
            </select>
            <button type="button" disabled={!newFor} onClick={() => router.push(`/events/${id}/health/participants/${newFor}/incident?from=cases`)} className={btnPrimary}>
              {t("healthCases.continue")}
            </button>
            <button type="button" onClick={() => setNewFor(null)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
          </span>
        )}
      </div>

      {!cases ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : cases.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{status === "active" ? t("healthCases.noneActive") : t("healthCases.none")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cases.map((c) => (
            <div key={c.id} className={"rounded-lg border p-3 " + (c.resolvedAt ? "border-mist/60 bg-paper-2/50" : "border-red-300/70 bg-paper")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 cursor-pointer" onClick={() => setDetail({ inc: c, participantId: c.participantId })}>
                  <a href={`/events/${id}/health/participants/${c.participantId}`} onClick={(e) => e.stopPropagation()} className="text-[14px] font-semibold text-ink hover:underline">
                    {participantListName(c.participant)}
                  </a>
                  {c.participant.groupName && <span className="ml-2 text-[12px] text-ink-secondary">{c.participant.groupName}</span>}
                  <div className="mt-1 text-[14px] text-ink">
                    <span className="mr-2 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink-secondary">{t(`incidentForm.category.${c.category}`)}</span>
                    {c.bodyView && <span className="mr-2 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink-secondary">{t(c.bodyView === "front" ? "bodyMap.front" : "bodyMap.back")}</span>}
                    {c.photoGcsPath && <span className="mr-2 text-[12px]" title={t("incidentForm.photoLabel")}>📷</span>}
                    {c.actionSummary}
                  </div>
                  <div className="text-[12px] text-ink-secondary">{meta(c)}</div>
                  {c.details && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-ink-secondary">{c.details}</p>}
                  {c.internalNote && <p className="mt-1 whitespace-pre-line rounded bg-amber-50/60 px-2 py-1 text-[12.5px] text-amber-900">🔒 {c.internalNote}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {c.resolvedAt && <span className="rounded-full bg-mist px-2 py-0.5 text-[12px] text-ink-secondary">✓ {t("incidentsPage.resolved")}</span>}
                  <button type="button" onClick={() => router.push(`/events/${id}/health/participants/${c.participantId}/incident?followUp=${c.id}&from=cases`)} className="text-[13px] text-ember hover:underline">
                    {t("incidentsPage.followUpButton")}
                  </button>
                  <button type="button" onClick={() => setResolved(c, !c.resolvedAt)} className={c.resolvedAt ? "text-[13px] text-ink-secondary hover:underline" : btn + " !px-3 !py-1 !text-[13px]"}>
                    {c.resolvedAt ? t("incidentsPage.reopen") : t("incidentsPage.markResolved")}
                  </button>
                </div>
              </div>
              {c.followUps.length > 0 && (
                <div className="ml-4 mt-2 flex flex-col gap-1 border-l border-mist pl-3">
                  {c.followUps.map((f) => (
                    <div key={f.id} onClick={() => setDetail({ inc: f, participantId: c.participantId })} className="cursor-pointer rounded p-1 hover:bg-paper-2">
                      <div className="text-[13px] text-ink-secondary">
                        {f.photoGcsPath && <span className="mr-1">📷</span>}
                        {f.actionSummary}
                      </div>
                      <div className="text-[12px] text-ink-secondary">{meta(f)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {detail && <IncidentDetailModal eventId={id} participantId={detail.participantId} incident={detail.inc} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  );
}
