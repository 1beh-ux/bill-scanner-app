import { prisma } from "@/lib/prisma";
import { czechAccountToIban, buildSpaydString } from "@/lib/qr-platba";
import QRCode from "qrcode";

export type ParticipantForMerge = {
  name: string;
  dateOfBirth: Date | null;
  address: string | null;
  healthInsurance: string | null;
  gender: string | null;
  isMember: boolean;
  releasePersons: string | null;
  registrationNumber: number | null;
  guardians: { name: string | null; email: string; relationship: string | null; phone: string | null }[];
};

export type EventForMerge = {
  name: string;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
  registrationBankAccountNumber: string | null;
  registrationBankCode: string | null;
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

function effectivePriceCzk(p: ParticipantForMerge, e: EventForMerge): number | null {
  return p.isMember ? e.memberPriceCzk : e.nonMemberPriceCzk;
}

/** Field-backed resolvers -- the allowlist of what an admin can point a `{{variable}}` at. */
const PARTICIPANT_FIELDS: Record<string, (p: ParticipantForMerge) => string> = {
  name: (p) => p.name,
  dateOfBirth: (p) => formatDate(p.dateOfBirth),
  address: (p) => p.address ?? "",
  healthInsurance: (p) => p.healthInsurance ?? "",
  gender: (p) => p.gender ?? "",
  isMember: (p) => (p.isMember ? "Ano" : "Ne"),
  releasePersons: (p) => p.releasePersons ?? "",
};

const GUARDIAN_FIELDS: Record<string, (p: ParticipantForMerge) => string> = {
  name: (p) => firstGuardian(p).name ?? "",
  email: (p) => firstGuardian(p).email ?? "",
  relationship: (p) => firstGuardian(p).relationship ?? "",
  phone: (p) => firstGuardian(p).phone ?? "",
};

const EVENT_FIELDS: Record<string, (e: EventForMerge) => string> = {
  name: (e) => e.name,
};

/**
 * Fixed set of computed resolvers -- an admin can remap which {{key}}
 * triggers one of these (via the MergeVariable.sourceField value matching
 * one of these ids), but adding a genuinely new kind of computation needs
 * a code change here.
 */
const COMPUTED: Record<string, (p: ParticipantForMerge, e: EventForMerge) => { text?: string; image?: Buffer }> = {
  effective_price: (p, e) => {
    const price = effectivePriceCzk(p, e);
    return { text: price != null ? `${price} Kč` : "" };
  },
  variable_symbol: (p) => ({ text: p.registrationNumber != null ? String(p.registrationNumber) : "" }),
};

/**
 * QR image resolver is separate (async, needs a PNG render) -- resolved
 * inline in resolveVariables rather than through the sync COMPUTED map.
 */
async function resolvePaymentQrImage(p: ParticipantForMerge, e: EventForMerge): Promise<Buffer | null> {
  const price = effectivePriceCzk(p, e);
  if (price == null || !e.registrationBankAccountNumber || !e.registrationBankCode) return null;
  const iban = czechAccountToIban(e.registrationBankAccountNumber, e.registrationBankCode);
  if (!iban) return null;
  const vs = p.registrationNumber != null ? String(p.registrationNumber) : undefined;
  const spayd = buildSpaydString(iban, price, e.name, vs);
  return QRCode.toBuffer(spayd, { type: "png", margin: 1, width: 400 });
}

export async function resolveVariables(
  participant: ParticipantForMerge,
  event: EventForMerge
): Promise<{ text: Record<string, string>; images: Record<string, Buffer> }> {
  const variables = await prisma.mergeVariable.findMany({ where: { active: true } });
  const text: Record<string, string> = {};
  const images: Record<string, Buffer> = {};

  for (const v of variables) {
    if (v.sourceType === "participant_field") {
      const fn = PARTICIPANT_FIELDS[v.sourceField];
      if (fn) text[v.key] = fn(participant);
    } else if (v.sourceType === "guardian_field") {
      const fn = GUARDIAN_FIELDS[v.sourceField];
      if (fn) text[v.key] = fn(participant);
    } else if (v.sourceType === "event_field") {
      const fn = EVENT_FIELDS[v.sourceField];
      if (fn) text[v.key] = fn(event);
    } else if (v.sourceType === "computed") {
      if (v.sourceField === "payment_qr_image") {
        const image = await resolvePaymentQrImage(participant, event);
        if (image) images[v.key] = image;
      } else {
        const fn = COMPUTED[v.sourceField];
        if (fn) {
          const result = fn(participant, event);
          if (result.text !== undefined) text[v.key] = result.text;
          if (result.image) images[v.key] = result.image;
        }
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
