// The participant's own page /u/<token> (2026-10-23): for a registration NOT linked to a person in
// Členové (imported, typed in), the parent fills in the event's fields, uploads its documents and sees
// the payment -- for that one event only. Behind the participant's birth date, like the portal.
// {{details_link}} in e-mails: the family portal when the person is linked, else this page.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-host";
import { withMembers } from "@/lib/children";
import { buildVariableSymbol, effectivePriceCzk, resolvePaymentQrImage } from "@/lib/document-variables";
import { askedFields, checkAnswers } from "@/lib/registration-fields";
import { countsAsReceived, docState } from "@/lib/registration-status";
import { birthDateMatches } from "@/lib/portal-rules";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { requiredEventFields, templateRules } from "@/lib/portal-server";
import { takeRateSlot } from "@/lib/portal-rate";
import { adultAt } from "@/lib/children";

/** The page's address for a participant (made on a real send: `create`), "" when there's none. */
export async function participantLinkUrl(participantId: string, create: boolean): Promise<string> {
  const p = await prisma.participant.findUnique({ where: { id: participantId }, select: { detailsToken: true, event: { select: { organizationId: true } } } });
  if (!p) return "";
  let token = p.detailsToken;
  if (!token && create) {
    token = crypto.randomBytes(18).toString("base64url");
    await prisma.participant.update({ where: { id: participantId }, data: { detailsToken: token } });
  }
  if (!token) return create ? "" : "https://…/u/…";
  return (await publicUrl("portal", null, `/u/${token}`, p.event.organizationId)) ?? "";
}

const loadByToken = (token: string) =>
  token && token.length <= 64 ? prisma.participant.findUnique({ where: { detailsToken: token }, include: { event: true, documents: true } }) : Promise.resolve(null);

/** The birth-date gate: null = passed; else the HTTP status (403 wrong, 429 too many wrong ones). */
export async function participantGate(token: string, birthDate: string | null): Promise<{ p: NonNullable<Awaited<ReturnType<typeof loadByToken>>> } | { status: 403 | 404 | 429 }> {
  const p = await loadByToken(token);
  if (!p || p.event.status !== "active") return { status: 404 };
  if (p.dateOfBirth && !birthDateMatches(birthDate, p.dateOfBirth)) {
    return (await takeRateSlot(`ugate:${p.id}`, 10, 3600_000)) ? { status: 403 } : { status: 429 };
  }
  return { p };
}

async function askedFor(p: { eventId: string; dateOfBirth: Date | null; event: { organizationId: string; startDate: Date } }) {
  const [eventFields, rules] = await Promise.all([requiredEventFields([p.eventId]), templateRules(p.event.organizationId)]);
  return askedFields(eventFields, rules, adultAt(p.dateOfBirth, p.event.startDate));
}

/** What the page shows: the event, the fields with their values, the payment, the documents. */
export async function participantPageData(p: NonNullable<Awaited<ReturnType<typeof loadByToken>>>) {
  const e = p.event;
  const values = (p.customFieldValues as Record<string, string> | null) ?? {};
  const asked = await askedFor(p);
  const accepted = p.registrationStatus === "accepted";
  const types = await prisma.eventListItem.findMany({ where: { eventId: e.id, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  let payment = null;
  if (accepted && p.registrationNumber != null) {
    const priced = await withMembers(e);
    const forMerge = { ...p, customFieldValues: values, guardians: [] };
    const qr = await resolvePaymentQrImage(forMerge, priced);
    const paid = e.paymentDocTypeId ? docState(p.documents, e.paymentDocTypeId).state === "received" : null;
    payment = {
      priceCzk: effectivePriceCzk(forMerge, priced),
      account: e.registrationBankAccountNumber && e.registrationBankCode ? `${e.registrationBankAccountNumber}/${e.registrationBankCode}` : null,
      variableSymbol: buildVariableSymbol(forMerge, priced),
      qrDataUrl: qr ? `data:image/png;base64,${qr.toString("base64")}` : null,
      paid,
    };
  }
  return {
    event: { name: e.name, startDate: e.startDate, endDate: e.endDate, location: e.location, info: e.portalInfo },
    name: p.name,
    accepted,
    fields: asked.map((f) => ({ ...f, value: values[f.key] ?? "" })),
    payment,
    documents: types
      .filter((t) => t.id !== e.paymentDocTypeId && !(t.data as DocumentTypeData | null)?.staticAttachment)
      .map((t) => {
        const mine = p.documents.filter((d) => d.eventListItemId === t.id);
        return {
          typeId: t.id,
          name: documentDisplayName({ ...t, data: t.data as DocumentTypeData | null }),
          received: mine.some(countsAsReceived),
          pending: mine.some((d) => d.reviewStatus === "pending"),
          canUpload: (t.data as DocumentTypeData | null)?.allowPortalUpload === true,
        };
      }),
  };
}

/** Saves the answers (all onto the participant -- there is no profile). */
export async function saveParticipantPage(p: NonNullable<Awaited<ReturnType<typeof loadByToken>>>, answers: unknown): Promise<{ ok: true } | { error: "invalid"; fields: string[] }> {
  const asked = await askedFor(p);
  const checked = checkAnswers(asked, answers, { prefill: {}, reviewed: true });
  if (!checked.ok) return { error: "invalid", fields: checked.errors };
  await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: { ...((p.customFieldValues as Record<string, string> | null) ?? {}), ...checked.values } } });
  return { ok: true };
}
