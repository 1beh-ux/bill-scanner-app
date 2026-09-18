import { prisma } from "@/lib/prisma";
import { czechAccountToIban, buildSpaydString } from "@/lib/qr-platba";
import QRCode from "qrcode";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";

export type ParticipantForMerge = {
  name: string;
  groupName: string | null;
  dateOfBirth: Date | null;
  registrationStatus: string;
  customFieldValues: Record<string, string> | null;
  registrationNumber: number | null;
  guardians: { name: string | null; email: string; relationship: string | null; phone: string | null }[];
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
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${dt.getUTCFullYear()}`;
}

function firstGuardian(p: ParticipantForMerge) {
  return p.guardians[0] ?? { name: "", email: "", relationship: "", phone: "" };
}

export function isMember(p: ParticipantForMerge, e: EventForMerge): boolean {
  const key = e.vsMembershipFieldKey ?? DEFAULT_MEMBERSHIP_FIELD_KEY;
  return p.customFieldValues?.[key] === "true";
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

// The one field genuinely not participant-scoped -- resolved unconditionally
// (not an EventParticipantField row, nothing to toggle) rather than living
// in the same list as everything else. Never seeded in production before
// this redesign, so the key is free to pick.
const EVENT_NAME_KEY = "nazev_akce";

export async function resolveVariables(
  participant: ParticipantForMerge,
  event: EventForMerge
): Promise<{ text: Record<string, string>; images: Record<string, Buffer> }> {
  const fields = await prisma.eventParticipantField.findMany({
    where: { eventId: event.id, active: true, surfaces: { has: "documents" } },
  });
  const text: Record<string, string> = { [EVENT_NAME_KEY]: event.name };
  const images: Record<string, Buffer> = {};

  for (const f of fields) {
    const fixedDef = FIXED_PARTICIPANT_FIELDS.find((d) => d.key === f.key);
    if (f.kind === "builtin") {
      const fn = fixedDef?.builtinProp ? BUILTIN_RESOLVERS[fixedDef.builtinProp] : undefined;
      if (fn) text[f.key] = fn(participant);
    } else if (f.kind === "guardian") {
      const fn = fixedDef?.guardianProp ? GUARDIAN_RESOLVERS[fixedDef.guardianProp] : undefined;
      if (fn) text[f.key] = fn(participant);
    } else if (f.kind === "custom") {
      // Values are stored as plain strings regardless of the field's
      // declared type -- "true"/"false" for boolean fields is rendered
      // Ano/Ne to match every other boolean-ish value in this file,
      // everything else passes through.
      const raw = participant.customFieldValues?.[f.key];
      text[f.key] = raw === "true" ? "Ano" : raw === "false" ? "Ne" : raw ?? "";
    } else if (f.kind === "computed") {
      if (f.computedType === "payment_qr_image") {
        const image = await resolvePaymentQrImage(participant, event);
        if (image) images[f.key] = image;
      } else if (f.computedType === "effective_price") {
        const price = effectivePriceCzk(participant, event);
        text[f.key] = price != null ? `${price} Kč` : "";
      } else if (f.computedType === "variable_symbol") {
        text[f.key] = buildVariableSymbol(participant, event);
      }
    }
  }

  return { text, images };
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
