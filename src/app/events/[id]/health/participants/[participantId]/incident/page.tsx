"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import IncidentFormModal, { type IncidentClientData } from "@/components/health/IncidentFormModal";

// New record / follow-up (?followUp=<id>) / correction (?edit=<id>) as a page
// (was a modal). ?from=list returns to the Zdraví list, otherwise to the
// participant's Zdraví detail.
export default function IncidentPage({ params }: { params: Promise<{ id: string; participantId: string }> }) {
  const { id: eventId, participantId } = use(params);
  const { t } = useTranslations();
  const router = useRouter();
  const q = useSearchParams();
  const followUpId = q.get("followUp");
  const editId = q.get("edit");
  const back = q.get("from") === "list" ? `/events/${eventId}/health` : `/events/${eventId}/health/participants/${participantId}`;
  const targetId = followUpId ?? editId;
  const [incident, setIncident] = useState<IncidentClientData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    fetch(`/api/participants/${participantId}/incidents`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: (IncidentClientData & { followUps?: IncidentClientData[] })[]) => {
        const all = list.flatMap((i) => [i, ...(i.followUps ?? [])]);
        const found = all.find((i) => i.id === targetId) ?? null;
        setIncident(found);
        setMissing(!found);
      })
      .catch(() => setMissing(true));
  }, [participantId, targetId]);

  if (targetId && !incident) {
    return <div className="p-8 text-[14px] text-ink-secondary">{missing ? t("eventDetail.notFound") : t("common.loading")}</div>;
  }
  return (
    <IncidentFormModal
      variant="page"
      eventId={eventId}
      participantId={participantId}
      mode={editId ? "edit" : followUpId ? "follow-up" : "new"}
      incident={incident ?? undefined}
      onClose={() => router.push(back)}
      onSaved={() => {}}
    />
  );
}
