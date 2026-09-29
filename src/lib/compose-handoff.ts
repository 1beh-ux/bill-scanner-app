// Opening the participant e-mail page (/events/[id]/participants/compose):
// one participant travels in the URL (reload / new tab keep working); a
// bulk selection in sessionStorage (hundreds of ids don't belong in a URL).
export type ComposeMode = "acceptance" | "freeform";
export type ComposeRequest = { mode: ComposeMode; participantIds: string[]; alreadyAccepted?: boolean };

const KEY = "participantCompose";

export function composeHref(eventId: string, req: ComposeRequest): string {
  const q = new URLSearchParams({ mode: req.mode });
  if (req.alreadyAccepted) q.set("regenerate", "1");
  if (req.participantIds.length === 1) q.set("ids", req.participantIds[0]);
  else {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(req.participantIds));
    } catch {
      q.set("ids", req.participantIds.join(","));
    }
  }
  return `/events/${eventId}/participants/compose?${q}`;
}

export function readComposeIds(query: URLSearchParams): string[] {
  const inUrl = query.get("ids");
  if (inUrl) return inUrl.split(",").filter(Boolean);
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
