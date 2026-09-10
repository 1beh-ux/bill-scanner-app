"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import IncidentFormModal from "@/components/health/IncidentFormModal";
import BulkStatusModal from "@/components/mail/BulkStatusModal";

type EventBasic = { id: string; name: string };

type Participant = {
  id: string;
  name: string;
  groupName: string | null;
  dateOfBirth: string | null;
  documentsTotal: number;
  documentsReceived: number;
};

export default function EventHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [incidentParticipantId, setIncidentParticipantId] = useState<string | null>(null);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [evRes, partRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
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

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("participantsPage.title")} ({participants.length})
      </h1>

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
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colDocuments")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => {
                const age = calculateAge(p.dateOfBirth);
                return (
                  <tr key={p.id} className="border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2 text-[14px]">
                      <a href={`/events/${id}/health/participants/${p.id}`} className="text-ember hover:underline">
                        {p.name}
                      </a>
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px] text-ink-secondary">
                      {p.documentsTotal > 0 ? `${p.documentsReceived}/${p.documentsTotal}` : "—"}
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
