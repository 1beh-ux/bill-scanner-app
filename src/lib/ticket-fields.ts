// Ticket events (2026-11-24): the event's own fields asked on the ticket form, once per order. They live only on the
// order (TicketOrder.fieldValues) -- never in people (Lidé) -- and print in the order e-mails and on the ticket as
// {{key}}. An event field of a ticket event is asked when active; "required" = Vyžadovat (requiredOnRegistration).
import { cleanFieldValue } from "@/lib/registration-fields";
import { choiceAnswer, choiceText, toBoolean } from "@/lib/participant-fields";

export type TicketField = { key: string; label: string; fieldType: string; options: unknown; required: boolean };

/** Submitted answers -> clean values (only the event's fields) or error codes "f.<key>". Pure. */
export function cleanTicketAnswers(fields: TicketField[], raw: unknown): { values: Record<string, string>; errors: string[] } {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const v = cleanFieldValue(f, choiceAnswer(f, typeof given[f.key] === "string" ? (given[f.key] as string) : ""));
    const empty = v === "" || (f.fieldType === "consent" && v !== "true");
    if (v === null || (f.required && empty)) errors.push(`f.${f.key}`);
    else if (v !== "") values[f.key] = v;
  }
  return { values, errors };
}

/** The answers as text for {{key}}: yes / no, several choices comma-joined. Pure. */
export function ticketFieldVars(fields: TicketField[], values: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = typeof values?.[f.key] === "string" ? (values![f.key] as string) : "";
    const b = f.fieldType === "boolean" || f.fieldType === "consent" ? toBoolean(raw, f.options) : null;
    out[f.key] = b !== null ? choiceText(b, f.options) : f.fieldType === "multi" ? raw.split("\n").filter(Boolean).join(", ") : raw;
  }
  return out;
}
