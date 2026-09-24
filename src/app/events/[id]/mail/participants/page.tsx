"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { participantListName } from "@/lib/participant-name";

type EventBasic = { id: string; name: string };

type DocStatus = { eventListItemId: string; name: string; received: boolean };

type Participant = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  registrationStatus: "pending" | "accepted";
  contactEmail: string;
  documents: DocStatus[];
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
  // Part 2: a brief undo toast after a manual received/missing toggle, instead of just
  // silently flipping the pill -- click "Vrátit zpět" to flip it right back.
  const [undo, setUndo] = useState<{ participantId: string; docTypeId: string; wasReceived: boolean } | null>(null);

  async function load() {
    setLoading(true);
    const [evRes, partRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/mail/participants?withDocuments=1`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [undo]);

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
    setUndo({ participantId, docTypeId, wasReceived: currentlyReceived });
    load();
  }

  async function undoToggle() {
    if (!undo) return;
    const { participantId, docTypeId, wasReceived } = undo;
    setUndo(null);
    // wasReceived = the state BEFORE the toggle that's being undone, so restoring it is
    // the opposite HTTP verb of what the original click did.
    await fetch(`/api/events/${id}/participants/${participantId}/documents/${docTypeId}`, {
      method: wasReceived ? "POST" : "DELETE",
    });
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  // Received/missing toggle for one document (shared by the table and the mobile cards).
  const docButton = (participantId: string, d: { eventListItemId: string; received: boolean }) => (
    <button
      onClick={() => toggleDoc(participantId, d.eventListItemId, d.received)}
      disabled={togglingKey === `${participantId}:${d.eventListItemId}`}
      className={
        "rounded-full px-2 py-0.5 disabled:opacity-50 " +
        (d.received ? "bg-pine/15 text-pine hover:bg-pine/25" : "bg-mist text-ink-secondary hover:bg-paper")
      }
      title={t("participantsPage.toggleDocumentHint")}
    >
      {d.received ? t("participantsPage.docReceived") : t("participantsPage.docMissing")}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}/mail`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.mail")}
      </a>

      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("participantsPage.mailListTitle")} ({participants.length})
      </h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("mailParticipantsPage.intro")}</p>

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
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colRegistration")}</th>
                {documentColumns.map((d) => (
                  <th key={d.id} className="p-2 text-[12px] font-medium text-ink-secondary">{d.name}</th>
                ))}
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.contactEmailLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => (
                <tr key={p.id} className="border-b border-mist/60 hover:bg-paper-2">
                  <td className="p-2 text-[14px] text-ink">{participantListName(p)}</td>
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
                  {p.documents.map((d) => (
                    <td key={d.eventListItemId} className="p-2 text-[13px]">
                      {docButton(p.id, d)}
                    </td>
                  ))}
                  <td className="p-2 text-[13px] text-ink-secondary">{p.contactEmail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards (same pattern as the bills list) */}
        <div className="flex flex-col gap-2 md:hidden">
          {filteredParticipants.map((p) => (
            <div key={p.id} className="rounded-lg border border-mist bg-paper-2 p-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <span className="min-w-0 text-[14px] font-medium text-ink">{participantListName(p)}</span>
                <span className="shrink-0 text-[12px]">
                  {p.registrationStatus === "accepted" ? (
                    <span className="rounded-full bg-pine/15 px-2 py-0.5 text-pine">{t("participantsPage.statusAccepted")}</span>
                  ) : (
                    <span className="rounded-full bg-mist px-2 py-0.5 text-ink-secondary">{t("participantsPage.statusPending")}</span>
                  )}
                </span>
              </div>
              {p.contactEmail && <div className="mb-1.5 break-all text-[12px] text-ink-secondary">{p.contactEmail}</div>}
              <dl className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 text-[12.5px]">
                {p.documents.map((d) => (
                  <div key={d.eventListItemId} className="contents">
                    <dt className="min-w-0 text-ink-secondary">{d.name}</dt>
                    <dd>{docButton(p.id, d)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        </>
      )}

      {undo && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-white shadow-lg">
          <span>{undo.wasReceived ? t("mailParticipantsPage.undoToastMarkedMissing") : t("mailParticipantsPage.undoToastMarkedReceived")}</span>
          <button onClick={undoToggle} className="font-medium text-ember-hover hover:underline">
            {t("mailParticipantsPage.undoButton")}
          </button>
        </div>
      )}
    </div>
  );
}
