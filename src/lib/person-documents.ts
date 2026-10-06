import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { RECEIVED_WHERE, backfillPicks, canBecomePersonDocument, profileDocRows } from "@/lib/registration-status";

// Permanent documents on the person (docs/registration-slice6-spec.md): an
// org document-type template marked "platí trvale" (ListTemplate.data.permanent)
// and the event document types with its key. Pure rules live in
// src/lib/registration-status.ts; this is the DB / GCS side.

/** Keys of the org document templates marked "platí trvale". */
export async function permanentDocKeys(): Promise<Set<string>> {
  const rows = await prisma.listTemplate.findMany({ where: { kind: "document", key: { not: null } }, select: { key: true, data: true } });
  return new Set(rows.filter((r) => (r.data as { permanent?: boolean } | null)?.permanent).map((r) => r.key!));
}

const currentDocs = (childIds: string[], keys: string[]) =>
  prisma.personDocument.findMany({
    where: { childId: { in: childIds }, docKey: { in: keys }, revokedAt: null },
    include: { sourceEvent: { select: { name: true } } },
  });
/** A covered event document type: received "z profilu (<doc.sourceEvent.name>)". */
export type ProfileDoc = ReturnType<typeof profileDocRows<Awaited<ReturnType<typeof currentDocs>>[number]>>[number];

/**
 * Per participant: the event document types its person's documents cover
 * (slice 6 #4), as received rows ("z profilu"). Participants not linked to a
 * person, or no permanent template at all -> nothing (= as before).
 */
export async function profileDocuments(participants: { id: string; eventId: string; childId: string | null }[]): Promise<Map<string, ProfileDoc[]>> {
  const out = new Map<string, ProfileDoc[]>();
  const linked = participants.filter((p) => p.childId);
  if (!linked.length) return out;
  const keys = await permanentDocKeys();
  if (!keys.size) return out;
  const [types, docs] = await Promise.all([
    prisma.eventListItem.findMany({ where: { eventId: { in: [...new Set(linked.map((p) => p.eventId))] }, kind: "document", key: { in: [...keys] } } }),
    currentDocs([...new Set(linked.map((p) => p.childId!))], [...keys]),
  ]);
  for (const p of linked) {
    const rows = profileDocRows(types.filter((t) => t.eventId === p.eventId), keys, docs.filter((d) => d.childId === p.childId));
    if (rows.length) out.set(p.id, rows);
  }
  return out;
}

/** Stores a file on the person (people/<childId>/documents/...) as their new current document of `docKey`. */
export async function savePersonDocument(opts: {
  childId: string;
  docKey: string;
  buffer?: Buffer;
  // Instead of `buffer`: copy an already stored file (a participant document's).
  copyFrom?: string;
  contentType?: string;
  filename: string | null;
  sourceParticipantDocumentId?: string;
  sourceEventId?: string;
  userId: string | null;
}) {
  const buffer = opts.buffer ?? (await billsBucket.file(opts.copyFrom!).download())[0];
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const gcsPath = `people/${opts.childId}/documents/${hash}-${sanitizeFilename(opts.filename || "dokument")}`;
  if (opts.copyFrom) await billsBucket.file(opts.copyFrom).copy(billsBucket.file(gcsPath));
  else await billsBucket.file(gcsPath).save(buffer, { contentType: opts.contentType });
  return prisma.personDocument.create({
    data: {
      childId: opts.childId,
      docKey: opts.docKey,
      gcsPath,
      contentHash: hash,
      originalFilename: opts.filename,
      sourceParticipantDocumentId: opts.sourceParticipantDocumentId ?? null,
      sourceEventId: opts.sourceEventId ?? null,
      createdByUserId: opts.userId,
    },
  });
}

/**
 * Slice 6 #2: a participant document that became received -- with a file, of
 * a permanent type, for a participant linked to a person -- becomes that
 * person's current document (the previous one stays as history). Anything
 * else (a tick, a generated document, an upload in review, an event-only
 * type, an unlinked participant) does nothing. Once per participant document.
 * Never throws: the save that called it already succeeded.
 */
export async function promoteToPersonDocument(participantDocumentId: string, userId: string | null): Promise<void> {
  try {
    const d = await prisma.participantDocument.findUnique({
      where: { id: participantDocumentId },
      include: { participant: { select: { childId: true, eventId: true } }, eventListItem: { select: { key: true } } },
    });
    const key = d?.eventListItem.key;
    if (!d || !key || !d.participant.childId || !canBecomePersonDocument(d) || !(await permanentDocKeys()).has(key)) return;
    if (await prisma.personDocument.findFirst({ where: { sourceParticipantDocumentId: d.id }, select: { id: true } })) return;
    await savePersonDocument({
      childId: d.participant.childId,
      docKey: key,
      copyFrom: d.gcsPath!,
      filename: d.originalFilename,
      sourceParticipantDocumentId: d.id,
      sourceEventId: d.participant.eventId,
      userId,
    });
  } catch (err) {
    console.error(`person document from participant document ${participantDocumentId} failed`, err);
  }
}

/**
 * Turning "platí trvale" on (slice 6 #6): the participant documents that would
 * become person documents -- per person without a current one, the newest
 * received file of this key (backfillPicks). `items` = which event document
 * types are this template's (by key, or for a template without one yet, by name).
 */
export async function backfillCandidates(docKey: string | null, items: object) {
  const [candidates, existing] = await Promise.all([
    prisma.participantDocument.findMany({
      where: { eventListItem: { kind: "document", ...items }, participant: { childId: { not: null } }, gcsPath: { not: null }, ...RECEIVED_WHERE },
      select: { id: true, gcsPath: true, receivedVia: true, reviewStatus: true, receivedAt: true, originalFilename: true, participant: { select: { childId: true, eventId: true } } },
    }),
    docKey ? prisma.personDocument.findMany({ where: { docKey }, select: { childId: true, sourceParticipantDocumentId: true, revokedAt: true } }) : [],
  ]);
  return backfillPicks(
    candidates.map((c) => ({ ...c, childId: c.participant.childId! })),
    existing
  );
}
