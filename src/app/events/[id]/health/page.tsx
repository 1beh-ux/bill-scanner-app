"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import { participantListName } from "@/lib/participant-name";
import IncidentFormModal from "@/components/health/IncidentFormModal";
import BulkStatusModal from "@/components/mail/BulkStatusModal";

type EventBasic = { id: string; name: string };

type Participant = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  dateOfBirth: string | null;
};

type HealthSignals = {
  incidentCount: Record<string, number>;
  lastIncidentAt: Record<string, string>;
  medPlanParticipantIds: string[];
};

export default function EventHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [signals, setSignals] = useState<HealthSignals>({ incidentCount: {}, lastIncidentAt: {}, medPlanParticipantIds: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [incidentParticipantId, setIncidentParticipantId] = useState<string | null>(null);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [evRes, partRes, signalsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
      fetch(`/api/events/${id}/participants/health-signals`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    if (signalsRes.ok) setSignals(await signalsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch(`/api/events/${id}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => {});
  }, [id]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  const medSet = useMemo(() => new Set(signals.medPlanParticipantIds), [signals]);

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("healthPage.title")} ({participants.length})
      </h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("healthPage.intro")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("participantsPage.searchPlaceholder")}
            aria-label={t("participantsPage.searchPlaceholder")}
            className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 pr-8 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-ember"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label={t("common.cancel")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
        <a
          href={`/events/${id}/health/send-summaries`}
          className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
        >
          {t("bulkSendSummaries.entryPoint")}
        </a>
        {moduleAccess.mail && (
          <button
            onClick={() => setStatusModalOpen(true)}
            className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
          >
            {t("participantsPage.openBulkStatusButton")}
          </button>
        )}
        <a href={`/events/${id}/participants`} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {t("participantsPage.manageButton")}
        </a>
      </div>

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("healthPage.colIncidents")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("healthPage.colMeds")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => {
                const age = calculateAge(p.dateOfBirth);
                const count = signals.incidentCount[p.id] ?? 0;
                const lastAt = signals.lastIncidentAt[p.id];
                return (
                  <tr key={p.id} className="border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2 text-[14px]">
                      <a href={`/events/${id}/health/participants/${p.id}`} className="text-ember hover:underline">
                        {participantListName(p)}
                      </a>
                      <a
                        href={`/events/${id}/participants?edit=${p.id}`}
                        className="ml-2 text-[11.5px] text-ink-secondary hover:text-ink hover:underline"
                      >
                        {t("healthPage.openInRosterLink")}
                      </a>
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px]">
                      {count > 0 ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-red-700"
                          title={lastAt ? t("healthPage.incidentTooltip", { date: new Date(lastAt).toLocaleString(lang === "cs" ? "cs-CZ" : "en-GB") }) : undefined}
                        >
                          <span className="h-[7px] w-[7px] rounded-full bg-red-600" />
                          {count}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2 text-[13px]">
                      {medSet.has(p.id) ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800" title={t("healthPage.medsTooltip")}>
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-600" />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right">
                      <button
                        onClick={() => setIncidentParticipantId(p.id)}
                        className="text-[13px] text-ember hover:underline"
                      >
                        {t("participantsPage.addIncidentButton")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {incidentParticipantId && (
        <IncidentFormModal
          eventId={id}
          participantId={incidentParticipantId}
          mode="new"
          onClose={() => setIncidentParticipantId(null)}
          onSaved={() => setIncidentParticipantId(null)}
        />
      )}

      {statusModalOpen && event && (
        <BulkStatusModal eventId={id} eventName={event.name} onClose={() => setStatusModalOpen(false)} />
      )}
    </div>
  );
}
