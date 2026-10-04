import { prisma } from "@/lib/prisma";
import { czechAccountToIban, buildSpaydString } from "@/lib/qr-platba";
import QRCode from "qrcode";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { composeValue, readComposite, toBoolean } from "@/lib/participant-fields";
import { withMembers } from "@/lib/children";
import { defaultHealthNotes, healthNotesText, notesFor, sanitizeHealthNotes } from "@/lib/health-notes";

export type ParticipantForMerge = {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  groupName: string | null;
  dateOfBirth: Date | null;
  registrationStatus: string;
  customFieldValues: Record<string, string> | null;
  registrationNumber: number | null;
  childId?: string | null;
  guardians: { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean }[];
};

// Camp-fee membership used to be read from a hardcoded custom-field key;
// now admin-configurable per event (Event.vsMembershipFieldKey, set from
// the variable-symbol config panel -- see buildVariableSymbol below), with
// this as the fallback for events that haven't set it explicitly yet.
const DEFAULT_MEMBERSHIP_FIELD_KEY = "clenstvi_zare";

export type EventForMerge = {
  id: string;
  name: string;
  startDate: Date;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
  registrationBankAccountNumber: string | null;
  registrationBankCode: string | null;
  vsEventType: number | null;
  vsOrderInYear: number | null;
  vsMembershipFieldKey: string | null;
  vsMemberValues?: unknown;
  mailQuestionnaireUrl: string | null;
  qrSizeMm: number | null;
  registrationDeadline: Date | null;
  healthNotes?: unknown;
  // Children with an accepted membership for this event's year (src/lib/children.ts
  // withMembers) -- only set for registration-connected events.
  memberChildIds?: Set<string>;
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${dt.getUTCFullYear()}`;
}

// "Primary guardian" for every guardian-kind document/email field (zast_jmeno, vztah,
// zast_telefon, ...): the one flagged receivesCommunications, else the first at all --
// same rule as resolveContactEmail below, reused rather than adding a second
// "hlavní zástupce" flag that would just duplicate it (Part 11-I of the participants/
// settings prompt asks for a documented primary-guardian rule; this is that rule).
function firstGuardian(p: ParticipantForMerge) {
  return (
    p.guardians.find((g) => g.receivesCommunications) ?? p.guardians[0] ?? { name: "", email: "", relationship: "", phone: "" }
  );
}

/** First guardian flagged to receive communications, else the first guardian at all. */
export function resolveContactEmail(p: { guardians: { email: string; receivesCommunications: boolean }[] }): string {
  return p.guardians.find((g) => g.receivesCommunications)?.email ?? p.guardians[0]?.email ?? "";
}

// A checkbox field stores "true"; typed/imported values are often Ano/Yes/1.
export const DEFAULT_MEMBER_VALUES = ["true", "ano", "yes", "1"];
export const normalizeMemberValue = (v: string) => v.trim().toLowerCase();

/** The event's "member" values (Nastavení akce -> variabilní symbol), or the defaults. */
export function memberValues(e: { vsMemberValues?: unknown }): string[] {
  const v = e.vsMemberValues;
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(normalizeMemberValue) : [];
  return list.length > 0 ? list : DEFAULT_MEMBER_VALUES;
}

// Stored "true" (a field's Ano/Ne values are normalised on save/import) or a
// default Ano value is a member; vsMemberValues is the older per-event list.
// In a registration-connected event, an accepted membership for the year also
// counts -- on top of the manual field, never instead of it.
export function isMember(p: ParticipantForMerge, e: EventForMerge): boolean {
  if (p.childId && e.memberChildIds?.has(p.childId)) return true;
  const key = e.vsMembershipFieldKey ?? DEFAULT_MEMBERSHIP_FIELD_KEY;
  const raw = p.customFieldValues?.[key] ?? "";
  return toBoolean(raw) === "true" || memberValues(e).includes(normalizeMemberValue(raw));
}

export function effectivePriceCzk(p: ParticipantForMerge, e: EventForMerge): number | null {
  return isMember(p, e) ? e.memberPriceCzk : e.nonMemberPriceCzk;
}

/**
 * Composes the payment variable symbol by concatenating, no separators:
 * 2-digit year (from the event's start date) + 1-digit event type +
 * 1-digit order-in-year (both admin-set per event) + 1-digit membership
 * flag (0 non-member / 1 member) + the participant's own 4-digit sequence
 * number -- e.g. year 26, type 1, order 1, non-member, sequence 217 ->
 * "261100217".
 */
export function buildVariableSymbol(p: ParticipantForMerge, e: EventForMerge): string {
  if (p.registrationNumber == null) return "";
  const year = String(e.startDate.getUTCFullYear() % 100).padStart(2, "0");
  const type = String(e.vsEventType ?? 0).slice(-1);
  const order = String(e.vsOrderInYear ?? 0).slice(-1);
  const membership = isMember(p, e) ? "1" : "0";
  const sequence = String(p.registrationNumber).padStart(4, "0");
  return `${year}${type}${order}${membership}${sequence}`;
}

const BUILTIN_RESOLVERS: Record<string, (p: ParticipantForMerge) => string> = {
  name: (p) => p.name,
  firstName: (p) => p.firstName ?? "",
  lastName: (p) => p.lastName ?? "",
  groupName: (p) => p.groupName ?? "",
  dateOfBirth: (p) => formatDate(p.dateOfBirth),
  registrationStatus: (p) => p.registrationStatus,
};

const GUARDIAN_RESOLVERS: Record<string, (p: ParticipantForMerge) => string> = {
  name: (p) => firstGuardian(p).name ?? "",
  email: (p) => firstGuardian(p).email ?? "",
  relationship: (p) => firstGuardian(p).relationship ?? "",
  phone: (p) => firstGuardian(p).phone ?? "",
};

/**
 * QR image resolver is separate (async, needs a PNG render) -- resolved
 * inline in resolveVariables rather than through a sync map.
 */
async function resolvePaymentQrImage(p: ParticipantForMerge, e: EventForMerge): Promise<Buffer | null> {
  const price = effectivePriceCzk(p, e);
  if (price == null || !e.registrationBankAccountNumber || !e.registrationBankCode) return null;
  const iban = czechAccountToIban(e.registrationBankAccountNumber, e.registrationBankCode);
  if (!iban) return null;
  const vs = buildVariableSymbol(p, e) || undefined;
  const spayd = buildSpaydString(iban, price, e.name, vs);
  return QRCode.toBuffer(spayd, { type: "png", margin: 1, width: 400 });
}

// Default side length of the payment QR in documents: big enough to scan
// from a printed page, small enough not to take over the form.
export const DEFAULT_QR_SIZE_MM = 35;

export async function resolveVariables(
  participant: ParticipantForMerge,
  event: EventForMerge,
  // Which fields are filled: generated documents ("documents") or e-mails ("email").
  surface: "documents" | "email" = "documents"
): Promise<{ text: Record<string, string>; images: Record<string, Buffer>; imageSizesMm: Record<string, number> }> {
  // All active fields: a composite field may be built from fields that aren't
  // themselves on this surface.
  const allFields = await prisma.eventParticipantField.findMany({ where: { eventId: event.id, active: true } });
  // Event-level fields -- not participant-scoped, so not an
  // EventParticipantField row, always resolved regardless of surfaces.
  // Same keys as the fixed per-purpose email variables in
  // src/lib/email-template-preview.ts, so {{camp_name}}/{{questionnaire_url}}
  // resolve the same way in both document merge and email templates.
  const text: Record<string, string> = {
    camp_name: event.name,
    questionnaire_url: event.mailQuestionnaireUrl ?? "",
    // Same "whole clause, vanishes cleanly when unset" trick as registration_deadline
    // below -- Part 8: "questionnaire URL line is omitted when the event has none",
    // which a bare {{questionnaire_url}} can't do inside fixed surrounding text.
    questionnaire_line: event.mailQuestionnaireUrl
      ? `Odkaz na vyplnění dotazníku: ${event.mailQuestionnaireUrl}.`
      : "",
    // The bare date -- the template writes its own sentence around it.
    registration_deadline: event.registrationDeadline ? formatDate(event.registrationDeadline) : "",
    // The whole sentence, empty when the event has no deadline (no conditional
    // blocks in templates, so this is how a line can vanish cleanly).
    registration_deadline_line: event.registrationDeadline
      ? `Vyplněné a podepsané dokumenty nám prosím pošlete zpět nejpozději do ${formatDate(event.registrationDeadline)}.`
      : "",
  };
  const images: Record<string, Buffer> = {};
  const imageSizesMm: Record<string, number> = {};

  if (participant.childId && event.memberChildIds === undefined) event = await withMembers(event);
  const values = fieldTextValues(participant, event, allFields);
  // {{health_notes}}: the Zdravotní poznámky (Nastavení akce -> Zdraví), all of them, in order.
  const healthConfig = event.healthNotes == null ? defaultHealthNotes(allFields) : sanitizeHealthNotes(event.healthNotes, new Set(allFields.map((f) => f.key)));
  text.health_notes = healthNotesText(notesFor(healthConfig, "all", values, Object.fromEntries(allFields.map((f) => [f.key, f.label]))));
  for (const f of allFields) {
    if (!f.surfaces.includes(surface)) continue;
    if (f.kind === "computed" && f.computedType === "payment_qr_image") {
      const image = await resolvePaymentQrImage(participant, event);
      if (image) {
        images[f.key] = image;
        imageSizesMm[f.key] = event.qrSizeMm ?? DEFAULT_QR_SIZE_MM;
      }
    } else if (values[f.key] !== undefined) {
      text[f.key] = values[f.key];
    }
  }

  return { text, images, imageSizesMm };
}

/**
 * Assigns a stable, per-event sequential registration number the first
 * time a participant is accepted (used as the payment variable symbol) --
 * a no-op if one is already set. Transactional to avoid two concurrent
 * accepts racing to the same number.
 */
export async function ensureRegistrationNumber(participantId: string, eventId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.participant.findUnique({
      where: { id: participantId },
      select: { registrationNumber: true },
    });
    if (existing?.registrationNumber != null) return existing.registrationNumber;

    const max = await tx.participant.aggregate({
      where: { eventId },
      _max: { registrationNumber: true },
    });
    const next = (max._max.registrationNumber ?? 0) + 1;
    await tx.participant.update({ where: { id: participantId }, data: { registrationNumber: next } });
    return next;
  });
}

type FieldForValues = { key: string; kind: string; fieldType: string; computedType: string | null; options: unknown };

/**
 * Text value of every given field for one participant (no QR image, no DB):
 * builtin/guardian/custom/computed text, then composite fields built from those.
 * Shared by merge/e-mail variables and the roster/Documents columns.
 */
export function fieldTextValues(participant: ParticipantForMerge, event: EventForMerge, fields: FieldForValues[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const fixedDef = FIXED_PARTICIPANT_FIELDS.find((d) => d.key === f.key);
    if (f.kind === "builtin") {
      const fn = fixedDef?.builtinProp ? BUILTIN_RESOLVERS[fixedDef.builtinProp] : undefined;
      if (fn) values[f.key] = fn(participant);
    } else if (f.kind === "guardian") {
      const fn = fixedDef?.guardianProp ? GUARDIAN_RESOLVERS[fixedDef.guardianProp] : undefined;
      if (fn) values[f.key] = fn(participant);
    } else if (f.kind === "custom" && f.fieldType !== "composite") {
      // Stored as plain strings; "true"/"false" of boolean fields read Ano/Ne.
      const raw = participant.customFieldValues?.[f.key];
      const b = f.fieldType === "boolean" ? toBoolean(raw, f.options) : null;
      values[f.key] = b === "true" ? "Ano" : b === "false" ? "Ne" : raw ?? "";
    } else if (f.kind === "computed") {
      if (f.computedType === "effective_price") {
        const price = effectivePriceCzk(participant, event);
        values[f.key] = price != null ? `${price} Kč` : "";
      } else if (f.computedType === "variable_symbol") {
        values[f.key] = buildVariableSymbol(participant, event);
      } else if (f.computedType === "contact_email") {
        values[f.key] = resolveContactEmail(participant);
      }
    }
  }
  for (const f of fields) {
    if (f.fieldType === "composite") values[f.key] = composeValue(readComposite(f.options), (k) => values[k]);
  }
  return values;
}
