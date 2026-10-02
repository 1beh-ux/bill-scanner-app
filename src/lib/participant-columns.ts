import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { formatFieldValue, type ParticipantFieldDef } from "@/lib/participant-fields";

// A participant row as GET /api/events/[id]/participants returns it -- enough to
// show any optional list column (participant list, Zdraví list).
export type ColumnParticipant = {
  customFieldValues: Record<string, string> | null;
  guardian: { name: string | null; email: string; relationship: string | null; phone: string | null } | null;
  computed: { price: number | null; var_symb: string; contact_email: string };
};

/** Display value of an optional column: guardian/computed fields resolved, custom (incl. combined) formatted. */
export function columnValue(field: ParticipantFieldDef, p: ColumnParticipant): string {
  if (field.kind === "guardian") {
    const prop = FIXED_PARTICIPANT_FIELDS.find((f) => f.key === field.key)?.guardianProp;
    const raw = prop ? p.guardian?.[prop] : undefined;
    return raw || "—";
  }
  if (field.kind === "computed") {
    if (field.key === "price") return p.computed.price != null ? `${p.computed.price} Kč` : "—";
    if (field.key === "var_symb") return p.computed.var_symb || "—";
    if (field.key === "Email") return p.computed.contact_email || "—";
    return "—";
  }
  return formatFieldValue(p.customFieldValues?.[field.key], field.fieldType, field.options);
}
