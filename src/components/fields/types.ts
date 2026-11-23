// Shapes returned by /api/fields/overview and /api/fields/documents (Fields Manager phase 2).
import type { OvField, OvGroup, OvSource, UseId } from "@/lib/fields-overview";

export type { OvField, OvGroup, OvSource, UseId };

export type FmVariable = { key: string; label: string; kind: "code" | "linked" | "calculated" | "free"; source: string; value: string | null; aliases: string[]; category: "event" | "participant" | "sentence" | "free"; edit: "inline" | "link" | "sentence" | null; href?: string; raw?: string };
export type FmAlias = { alias: string; targetKey: string; targetKind: string; reason: string };
export type FmEvent = { id: string; name: string; startDate: string; kind: string; status: string };

export type FmOverview = {
  events: FmEvent[];
  eventId: string | null;
  guardianSlots: number;
  reviewCount?: number;
  contactMissing?: number;
  aliases: FmAlias[];
  variables: FmVariable[];
  groups: OvGroup[];
  fields: OvField[];
  sources: OvSource[];
  uses: UseId[];
};

export type FmDocTemplate = { docTypeId: string; name: string; error: string | null; disabled?: string[]; placeholders: { key: string; status: string; hasSpaces: boolean }[] };

/** Document templates that use a field (directly or through one of its aliases). */
export function docsUsing(field: Pick<OvField, "key" | "aliases">, docs: FmDocTemplate[] | null): FmDocTemplate[] {
  if (!docs) return [];
  const names = new Set([field.key, ...field.aliases]);
  return docs.filter((d) => d.placeholders.some((p) => names.has(p.key)));
}
