"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import { formatFieldValue, type ParticipantFieldDef } from "@/lib/participant-fields";

type EventBasic = { id: string; name: string };

type DocStatus = { eventListItemId: string; name: string; received: boolean };

type Participant = {
  id: string;
  name: string;
  dateOfBirth: string | null;
  registrationStatus: "pending" | "accepted";
  documents: DocStatus[];
  customFieldValues: Record<string, string> | null;
};

export default function MailParticipantsPage({
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
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);

  async function load() {
    setLoading(true);
    const [evRes, partRes, fieldsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/mail/participants?withDocuments=1`),
      fetch(`/api/events/${id}/participant-fields?surface=mail_list`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    if (fieldsRes.ok) setFields(await fieldsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  const documentColumns = participants[0]?.documents.map((d) => ({ id: d.eventListItemId, name: d.name })) ?? [];

  async function toggleDoc(participantId: string, docTypeId: string, currentlyReceived: boolean) {
    const key = `${participantId}:${docTypeId}`;
    setTogglingKey(key);
    await fetch(`/api/events/${id}/participants/${participantId}/documents/${docTypeId}`, {
      method: currentlyReceived ? "DELETE" : "POST",
    });
    setTogglingKey(null);
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}/mail`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.mail")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("participantsPage.mailListTitle")} ({participants.length})
      </h1>

      <div className="mb-4 relative max-w-sm">
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

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colRegistration")}</th>
                {fields.map((f) => (
                  <th key={f.id} className="p-2 text-[12px] font-medium text-ink-secondary">{f.label}</th>
                ))}
                {documentColumns.map((d) => (
                  <th key={d.id} className="p-2 text-[12px] font-medium text-ink-secondary">{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => {
                const age = calculateAge(p.dateOfBirth);
                return (
                  <tr key={p.id} className="border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2 text-[14px] text-ink">{p.name}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px]">
                      {p.registrationStatus === "accepted" ? (
                        <span className="rounded-full bg-pine/15 px-2 py-0.5 text-pine">
                          {t("participantsPage.statusAccepted")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-mist px-2 py-0.5 text-ink-secondary">
                          {t("participantsPage.statusPending")}
                        </span>
                      )}
                    </td>
                    {fields.map((f) => (
                      <td key={f.id} className="p-2 text-[14px] text-ink-secondary">
                        {formatFieldValue(p.customFieldValues?.[f.key], f.fieldType)}
                      </td>
                    ))}
                    {p.documents.map((d) => {
                      const key = `${p.id}:${d.eventListItemId}`;
                      return (
                        <td key={d.eventListItemId} className="p-2 text-[13px]">
                          <button
                            onClick={() => toggleDoc(p.id, d.eventListItemId, d.received)}
                            disabled={togglingKey === key}
                            className={
                              "rounded-full px-2 py-0.5 disabled:opacity-50 " +
                              (d.received ? "bg-pine/15 text-pine hover:bg-pine/25" : "bg-mist text-ink-secondary hover:bg-paper")
                            }
                            title={t("participantsPage.toggleDocumentHint")}
                          >
                            {d.received ? t("participantsPage.docReceived") : t("participantsPage.docMissing")}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
