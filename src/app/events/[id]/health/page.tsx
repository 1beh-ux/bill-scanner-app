"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import type { HealthNote } from "@/lib/health-notes";
import { calculateAge } from "@/lib/age";
import { participantListName } from "@/lib/participant-name";
import IncidentFormModal from "@/components/health/IncidentFormModal";
import StatusUpdateButton from "@/components/mail/StatusUpdateButton";

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
  // Every configured health note (with its places): the "Seznam Zdraví" column + highlight badges.
  const [notes, setNotes] = useState<Record<string, HealthNote[]>>({});
  const listNotes = (pid: string) => (notes[pid] ?? []).filter((n) => n.places.includes("list"));
  const warning = (pid: string) => {
    const hot = (notes[pid] ?? []).filter((n) => n.highlight);
    return hot.length > 0 ? (
      <span title={hot.map((n) => `${n.label}: ${n.value}`).join("\n")} className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
        ⚠ {hot.map((n) => n.label).join(", ")}
      </span>
    ) : null;
  };
  const anyListNotes = Object.values(notes).some((list) => list.some((n) => n.places.includes("list")));

  async function load() {
    setLoading(true);
    const [evRes, partRes, signalsRes, notesRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
      fetch(`/api/events/${id}/participants/health-signals`),
      fetch(`/api/events/${id}/health-notes/values?place=all`),
    ]);
    if (notesRes.ok) setNotes((await notesRes.json()).notes);
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
        {moduleAccess.mail && <StatusUpdateButton eventId={id} />}
        <a href={`/events/${id}/participants`} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {t("participantsPage.manageButton")}
        </a>
      </div>

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("healthPage.colIncidents")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("healthPage.colMeds")}</th>
                {anyListNotes && <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantDetail.notesTitle")}</th>}
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
                      {warning(p.id)}
                      <a
                        href={`/events/${id}/participants/${p.id}`}
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
                    {anyListNotes && (
                      <td className="max-w-[280px] p-2 text-[12px] text-ink-secondary">
                        {listNotes(p.id).map((n) => (
                          <div key={n.key} className={"line-clamp-2 " + (n.highlight ? "text-red-700" : "")} title={n.value}>
                            <strong>{n.label}:</strong> {n.value}
                          </div>
                        ))}
                      </td>
                    )}
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

        {/* Mobile: cards (same pattern as the bills list) */}
        <div className="flex flex-col gap-2 md:hidden">
          {filteredParticipants.map((p) => {
            const age = calculateAge(p.dateOfBirth);
            const count = signals.incidentCount[p.id] ?? 0;
            return (
              <div key={p.id} className="rounded-lg border border-mist bg-paper-2 p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <a href={`/events/${id}/health/participants/${p.id}`} className="text-[14px] font-medium text-ember hover:underline">
                      {participantListName(p)}
                    </a>
                    {warning(p.id)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 text-[12px]">
                    {count > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-red-700" title={t("healthPage.colIncidents")}>
                        <span className="h-[7px] w-[7px] rounded-full bg-red-600" />
                        {count}
                      </span>
                    )}
                    {medSet.has(p.id) && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800" title={t("healthPage.medsTooltip")}>
                        <span className="h-[7px] w-[7px] rounded-full bg-amber-600" />
                        {t("healthPage.colMeds")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-secondary">
                  {p.groupName && <span>{p.groupName}</span>}
                  {age !== null && <span>{t("participantsPage.colAge")}: {age}</span>}
                </div>
                {listNotes(p.id).map((n) => (
                  <div key={n.key} className={"mt-0.5 text-[12px] " + (n.highlight ? "text-red-700" : "text-ink-secondary")}>
                    <strong>{n.label}:</strong> {n.value}
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between">
                  <a href={`/events/${id}/participants/${p.id}`} className="text-[12px] text-ink-secondary hover:text-ink hover:underline">
                    {t("healthPage.openInRosterLink")}
                  </a>
                  <button onClick={() => setIncidentParticipantId(p.id)} className="text-[13px] text-ember hover:underline">
                    {t("participantsPage.addIncidentButton")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
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

    </div>
  );
}
