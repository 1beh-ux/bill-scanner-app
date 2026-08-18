import type { Incident, IncidentUpdate } from "@/generated/prisma";

export type EffectiveIncident = Pick<
  Incident,
  | "id"
  | "participantId"
  | "createdAt"
  | "createdByUserId"
  | "category"
  | "templateType"
  | "parentIncidentId"
> & {
  incidentDate: Incident["incidentDate"];
  incidentTime: string | null;
  actionSummary: string;
  pillName: string | null;
  details: string | null;
  photoGcsPath: string | null;
  tempC: Incident["tempC"];
  bodyView: Incident["bodyView"];
  bodyXPct: Incident["bodyXPct"];
  bodyYPct: Incident["bodyYPct"];
  lastUpdatedAt: Date | null;
};

// "Current" state = the base incident row overlaid by the chronologically
// latest IncidentUpdate, if one exists. If that latest update is a `void`,
// the incident is soft-deleted -- filtered from every read path, per
// decision 1 in the health module design doc.
export function resolveIncidentState(
  incident: Incident,
  updates: IncidentUpdate[]
): EffectiveIncident | null {
  const latest = updates.length > 0 ? updates[updates.length - 1] : null;

  if (latest?.updateType === "void") return null;

  return {
    id: incident.id,
    participantId: incident.participantId,
    createdAt: incident.createdAt,
    createdByUserId: incident.createdByUserId,
    category: incident.category,
    templateType: incident.templateType,
    parentIncidentId: incident.parentIncidentId,
    incidentDate: latest ? latest.incidentDate : incident.incidentDate,
    incidentTime: latest ? latest.incidentTime : incident.incidentTime,
    actionSummary: latest ? latest.actionSummary : incident.actionSummary,
    pillName: latest ? latest.pillName : incident.pillName,
    details: latest ? latest.details : incident.details,
    photoGcsPath: latest ? latest.photoGcsPath : incident.photoGcsPath,
    tempC: latest ? latest.tempC : incident.tempC,
    bodyView: latest ? latest.bodyView : incident.bodyView,
    bodyXPct: latest ? latest.bodyXPct : incident.bodyXPct,
    bodyYPct: latest ? latest.bodyYPct : incident.bodyYPct,
    lastUpdatedAt: latest ? latest.updatedAt : null,
  };
}
