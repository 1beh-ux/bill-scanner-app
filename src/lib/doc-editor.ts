// Fields Manager phase 6 (design §11): the server half of the template editor. Reads a document type's Google Doc,
// classifies its placeholders through the resolver, keeps queued edits as DocumentEdit rows, and saves them in ONE
// batchUpdate guarded by the revision read just before. Nothing is written to a Doc until the user presses save.
import type { Prisma } from "@/generated/prisma";
import type { docs_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getDocsClient, getDriveClient, toDriveError } from "@/lib/drive";
import { extractGoogleDocId } from "@/lib/document-merge";
import type { DocumentTypeData } from "@/lib/mail-reply-template";
import { classifyKey, GUARDIAN_PROPS, invalidateResolverContext, loadResolverContext } from "@/lib/field-resolver";
import { BUILTIN_EVENT_VARIABLES } from "@/lib/event-variables";
import { guardianSettings } from "@/lib/guardian-fields-server";
import { EVENT_KEYS } from "@/lib/template-check";
import { brokenPlaceholders, buildRequests, docParagraphs, editKey, findPlaceholders, textOccurrences, type DocEdit } from "@/lib/doc-edits";

export type PhStatus = "current" | "alias" | "variable" | "spaces" | "unresolved";

async function docType(eventId: string, docTypeId: string) {
  const dt = await prisma.eventListItem.findFirst({ where: { id: docTypeId, eventId, kind: "document" } });
  const templateId = (dt?.data as DocumentTypeData | null)?.templateGoogleDocId;
  return dt && templateId ? { dt, docId: extractGoogleDocId(templateId) } : null;
}

async function readDoc(eventId: string, docId: string): Promise<docs_v1.Schema$Document> {
  const docs = await getDocsClient(eventId);
  try {
    return (await docs.documents.get({ documentId: docId, includeTabsContent: true })).data;
  } catch (err) {
    throw await toDriveError(eventId, err, { purpose: "read" });
  }
}

/** Events of the organization whose document types use this Doc (a shared template = more than one). */
async function usedBy(organizationId: string, docId: string) {
  const items = await prisma.eventListItem.findMany({ where: { kind: "document", event: { organizationId } }, select: { id: true, eventId: true, data: true } });
  return items.filter((i) => {
    const t = (i.data as DocumentTypeData | null)?.templateGoogleDocId;
    return t && extractGoogleDocId(t) === docId;
  });
}

const pendingEdits = (organizationId: string, docId: string) =>
  prisma.documentEdit.findMany({ where: { organizationId, googleDocId: docId, status: "pending" }, orderBy: { createdAt: "asc" } });

/** Everything the editor screen shows for one document type. */
export async function analyzeTemplate(eventId: string, organizationId: string, docTypeId: string) {
  const found = await docType(eventId, docTypeId);
  if (!found) return null;
  const doc = await readDoc(eventId, found.docId);
  const paras = docParagraphs(doc);
  const [ctx, fields, users, edits] = await Promise.all([
    loadResolverContext(eventId),
    prisma.eventParticipantField.findMany({ where: { eventId }, select: { key: true, label: true, active: true }, orderBy: { sortOrder: "asc" } }),
    usedBy(organizationId, found.docId),
    pendingEdits(organizationId, found.docId),
  ]);
  const fieldKeys = new Set(fields.map((f) => f.key));
  const guardianOwn = (await guardianSettings(organizationId)).fields;
  const status = (key: string, hasSpaces: boolean): { status: PhStatus; canonical?: string } => {
    if (hasSpaces) return { status: "spaces" };
    if (EVENT_KEYS.has(key) && !ctx.aliases[key]) return { status: "current" };
    const c = classifyKey(key, ctx, fieldKeys);
    if (c.kind === "unresolved") return { status: fieldKeys.has(key) ? "current" : "unresolved" };
    if (c.viaAlias) return { status: "alias", canonical: c.canonical };
    return { status: c.kind === "event_variable" ? "variable" : "current" };
  };
  const placeholders = findPlaceholders(paras).map((p) => ({ key: p.key, raw: p.raw, start: p.start, where: p.where, ...status(p.key, p.hasSpaces) }));
  // Typed text equal to an event variable's value (e.g. the place) -> could become the variable.
  const values = { ...ctx.linked, ...ctx.free };
  const typed = Object.entries(values)
    .filter(([, v]) => typeof v === "string" && v.trim().length >= 4)
    .map(([key, text]) => ({ key, text, count: textOccurrences(paras, text).length }))
    .filter((x) => x.count > 0);
  return {
    docId: found.docId,
    title: doc.title ?? "",
    revisionId: doc.revisionId ?? null,
    paragraphs: paras.map((p) => ({ text: p.text, start: p.start, where: p.where })),
    placeholders,
    broken: brokenPlaceholders(paras),
    typed,
    sharedWith: users.filter((u) => u.eventId !== eventId).length,
    edits: edits.map((e) => ({ id: e.id, edit: e.request as DocEdit, reason: e.reason, createdAt: e.createdAt })),
    // What an unresolved placeholder can be connected to (alias or rename): the event's fields, guardian slots, event variables.
    targets: [
      ...fields.filter((f) => f.active).map((f) => ({ key: f.key, label: f.label, group: "field" as const })),
      ...Array.from({ length: ctx.slots }, (_, i) => GUARDIAN_PROPS.filter((p) => p !== "mail").map((p) => ({ key: `guardian${i + 1}_${p}`, label: `${i + 1}|${p}`, group: "guardian" as const }))).flat(),
      // The organization's own guardian fields (2026-11-26): "Zástupce N – <name>".
      ...Array.from({ length: ctx.slots }, (_, i) => guardianOwn.map((g) => ({ key: `guardian${i + 1}_${g.key}`, label: `${i + 1}|=${g.label}`, group: "guardian" as const }))).flat(),
      ...BUILTIN_EVENT_VARIABLES.map((v) => ({ key: v.key, label: v.label, group: "event" as const })),
      ...Object.keys(ctx.free).map((k) => ({ key: k, label: k, group: "event" as const })),
    ],
  };
}

/**
 * Connects an unresolved placeholder to an existing key by an organization alias (the Doc stays as it is; documents
 * print the target's value under the old name). Only for a key that means nothing today, to a key that resolves.
 */
export async function addAlias(eventId: string, organizationId: string, userId: string, alias: string, target: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias) || alias === target) return { error: "invalid" as const };
  const ctx = await loadResolverContext(eventId);
  const fieldKeys = new Set((await prisma.eventParticipantField.findMany({ where: { eventId }, select: { key: true } })).map((f) => f.key));
  if (EVENT_KEYS.has(alias) || classifyKey(alias, ctx, fieldKeys).kind !== "unresolved" || fieldKeys.has(alias)) return { error: "alias_taken" as const };
  const t = classifyKey(target, ctx, fieldKeys);
  if (t.kind === "unresolved" || t.viaAlias) return { error: "invalid" as const };
  const targetKind = t.kind === "event_variable" ? "event_variable" : t.kind === "guardian" ? "guardian" : "field";
  const row = await prisma.fieldAlias.create({ data: { organizationId, alias, targetKind, targetKey: target, reason: "document", createdById: userId } });
  invalidateResolverContext(eventId);
  return { id: row.id };
}

export async function queueEdit(eventId: string, organizationId: string, docTypeId: string, userId: string, edit: DocEdit, reason: string) {
  const found = await docType(eventId, docTypeId);
  if (!found) return null;
  // The same edit twice is one edit.
  const same = (await pendingEdits(organizationId, found.docId)).find((e) => editKey(e.request as DocEdit) === editKey(edit));
  return same ?? prisma.documentEdit.create({ data: { organizationId, googleDocId: found.docId, request: edit as unknown as Prisma.InputJsonValue, reason, createdById: userId } });
}

export const discardEdit = (organizationId: string, id: string) => prisma.documentEdit.updateMany({ where: { id, organizationId, status: "pending" }, data: { status: "discarded" } });

const isRevisionConflict = (err: unknown) => /revision|FAILED_PRECONDITION/i.test(String((err as { message?: string })?.message ?? err));

/**
 * Saves the pending edits of a document type's Doc: re-read, plan, one batchUpdate with requiredRevisionId (a
 * change made in Google meanwhile is re-read once, then reported). `copy`: a shared template is first copied for
 * this event only (the other events keep the original) and the edits go to the copy.
 */
export async function saveEdits(eventId: string, organizationId: string, docTypeId: string, opts: { copy?: boolean } = {}) {
  const found = await docType(eventId, docTypeId);
  if (!found) return { error: "not_found" as const };
  let docId = found.docId;
  const edits = await pendingEdits(organizationId, docId);
  if (!edits.length) return { error: "nothing_to_save" as const };
  const shared = (await usedBy(organizationId, docId)).some((u) => u.eventId !== eventId);
  if (shared && !opts.copy) return { error: "shared_template" as const };

  if (shared && opts.copy) {
    const drive = await getDriveClient(eventId);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, driveParticipantsFolderId: true } });
    try {
      const orig = await drive.files.get({ fileId: docId, fields: "name,parents", supportsAllDrives: true });
      const parents = event.driveParticipantsFolderId ? [event.driveParticipantsFolderId] : (orig.data.parents ?? undefined);
      const copy = await drive.files.copy({ fileId: docId, requestBody: { name: `${orig.data.name} – ${event.name}`, ...(parents && { parents }) }, supportsAllDrives: true, fields: "id" });
      docId = copy.data.id!;
    } catch (err) {
      throw await toDriveError(eventId, err, { purpose: "write" });
    }
    const data = { ...((found.dt.data as DocumentTypeData | null) ?? {}), templateGoogleDocId: docId };
    await prisma.eventListItem.update({ where: { id: docTypeId }, data: { data: data as Prisma.InputJsonValue } });
    await prisma.documentEdit.updateMany({ where: { id: { in: edits.map((e) => e.id) } }, data: { googleDocId: docId } });
  }

  const docs = await getDocsClient(eventId);
  for (let attempt = 0; ; attempt++) {
    const doc = await readDoc(eventId, docId);
    const { requests, missing } = buildRequests(edits.map((e) => e.request as DocEdit), docParagraphs(doc));
    const missingIds = new Set(missing.map((i) => edits[i].id));
    if (requests.length) {
      try {
        await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests, writeControl: { requiredRevisionId: doc.revisionId! } } });
      } catch (err) {
        if (attempt === 0 && isRevisionConflict(err)) continue; // changed in Google meanwhile: re-read, re-plan once
        if (isRevisionConflict(err)) return { error: "revision_conflict" as const };
        throw await toDriveError(eventId, err, { purpose: "write" });
      }
    }
    const after = await readDoc(eventId, docId);
    await prisma.documentEdit.updateMany({ where: { id: { in: edits.filter((e) => !missingIds.has(e.id)).map((e) => e.id) } }, data: { status: "saved", savedRevision: after.revisionId ?? null } });
    // An edit with nothing left to change (already done in Google) is closed too -- it isn't an error.
    if (missingIds.size) await prisma.documentEdit.updateMany({ where: { id: { in: [...missingIds] } }, data: { status: "saved", savedRevision: after.revisionId ?? null } });
    return { saved: edits.length - missingIds.size, nothingToChange: missingIds.size, docId, copied: docId !== found.docId };
  }
}

/**
 * Phase 7 "change directly": a pending rename edit for every template of the organization that uses an old key
 * (each Doc read once). They wait in Dokumenty for Save like any other edit. Unreadable Docs are skipped and counted.
 */
export async function queueRenamesWhereUsed(organizationId: string, userId: string | null, renames: { from: string; to: string }[]) {
  const items = await prisma.eventListItem.findMany({ where: { kind: "document", event: { organizationId } }, select: { eventId: true, data: true } });
  const byDoc = new Map<string, string>();
  for (const i of items) {
    const t = (i.data as DocumentTypeData | null)?.templateGoogleDocId;
    if (t && !byDoc.has(extractGoogleDocId(t))) byDoc.set(extractGoogleDocId(t), i.eventId);
  }
  const ids: string[] = [];
  let unreadable = 0;
  for (const [docId, eventId] of byDoc) {
    const keys = await readDoc(eventId, docId).then((d) => new Set(findPlaceholders(docParagraphs(d)).map((p) => p.key)), () => null);
    if (!keys) {
      unreadable++;
      continue;
    }
    for (const r of renames.filter((x) => keys.has(x.from))) {
      const edit: DocEdit = { type: "rename", from: r.from, to: r.to };
      const same = (await pendingEdits(organizationId, docId)).find((e) => editKey(e.request as DocEdit) === editKey(edit));
      ids.push((same ?? (await prisma.documentEdit.create({ data: { organizationId, googleDocId: docId, request: edit as unknown as Prisma.InputJsonValue, reason: "merge", createdById: userId } }))).id);
    }
  }
  return { ids, docs: byDoc.size, unreadable };
}
