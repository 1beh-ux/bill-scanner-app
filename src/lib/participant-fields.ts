export type ParticipantFieldType = "text" | "number" | "date" | "boolean" | "select";
export type ParticipantFieldSurface = "list" | "health_list" | "health_detail" | "mail_list";

export type ParticipantFieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: ParticipantFieldType;
  options: string[] | null;
  surfaces: ParticipantFieldSurface[];
};

// "Ano"/"Ne" hardcoded rather than translated -- matches the existing
// convention for boolean display elsewhere in this app (src/lib/drive-export.ts).
export function formatFieldValue(value: string | undefined, fieldType: ParticipantFieldType): string {
  if (value === undefined || value === "") return "—";
  if (fieldType === "boolean") return value === "true" ? "Ano" : "Ne";
  return value;
}
