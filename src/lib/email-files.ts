// Uploaded files an e-mail carries (2026-10-25): per template (purpose key) at organization level
// (Šablony -> E-maily, every send of that e-mail) and per event (Nastavení akce -> Pošta, only that
// event's sends) -- both go. Any kind of e-mail: portal link / invitation, acceptance, tickets, own ones...
// Stored in GCS under email-files/<organizationId>/; the JSON lists them. readEmailFiles is pure.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";

export type EmailFile = { id: string; name: string; type: string; size: number; path: string };
export const EMAIL_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_FILES_PER_KEY = 10;

/** Stored JSON -> { purposeKey: files } (unknown shapes dropped). */
export function readEmailFiles(raw: unknown): Record<string, EmailFile[]> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, EmailFile[]> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!Array.isArray(v)) continue;
    const files = v
      .filter((f): f is EmailFile => !!f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string" && typeof f.type === "string" && typeof f.size === "number" && typeof f.path === "string")
      .slice(0, EMAIL_FILES_PER_KEY);
    if (files.length) out[k] = files;
  }
  return out;
}

/** Stores an uploaded file for one e-mail (organization's when eventId is null) and returns the new list. */
export async function addEmailFile(o: { organizationId: string; eventId: string | null; purposeKey: string; name: string; type: string; buffer: Buffer }): Promise<EmailFile[] | "too_many"> {
  const current = await filesOf(o.organizationId, o.eventId);
  const list = current[o.purposeKey] ?? [];
  if (list.length >= EMAIL_FILES_PER_KEY) return "too_many";
  const id = crypto.randomUUID();
  const name = sanitizeFilename(o.name || "priloha");
  const path = `email-files/${o.organizationId}/${id}-${name}`;
  await billsBucket.file(path).save(o.buffer, { contentType: o.type || "application/octet-stream" });
  const next = { ...current, [o.purposeKey]: [...list, { id, name, type: o.type || "application/octet-stream", size: o.buffer.length, path }] };
  await save(o.organizationId, o.eventId, next);
  return next[o.purposeKey];
}

export async function removeEmailFile(o: { organizationId: string; eventId: string | null; purposeKey: string; id: string }): Promise<EmailFile[]> {
  const current = await filesOf(o.organizationId, o.eventId);
  const gone = (current[o.purposeKey] ?? []).find((f) => f.id === o.id);
  const list = (current[o.purposeKey] ?? []).filter((f) => f.id !== o.id);
  const next = { ...current, [o.purposeKey]: list };
  if (!list.length) delete next[o.purposeKey];
  await save(o.organizationId, o.eventId, next);
  if (gone) await billsBucket.file(gone.path).delete({ ignoreNotFound: true });
  return list;
}

export async function filesOf(organizationId: string, eventId: string | null): Promise<Record<string, EmailFile[]>> {
  const row = eventId
    ? await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { emailFiles: true } })
    : await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { emailFiles: true } });
  return readEmailFiles(row.emailFiles);
}

async function save(organizationId: string, eventId: string | null, files: Record<string, EmailFile[]>) {
  if (eventId) await prisma.event.update({ where: { id: eventId }, data: { emailFiles: files } });
  else await prisma.organization.update({ where: { id: organizationId }, data: { emailFiles: files } });
}

/**
 * The files one e-mail carries, downloaded: the organization's for this purpose key, then the event's.
 * Call once per send run (not per recipient). A file gone from storage is skipped (logged), not fatal.
 */
export async function templateFiles(organizationId: string, eventId: string | null, purposeKey: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }[]> {
  const [org, event] = await Promise.all([filesOf(organizationId, null), eventId ? filesOf(organizationId, eventId) : Promise.resolve({} as Record<string, EmailFile[]>)]);
  const out: { buffer: Buffer; filename: string; mimeType: string }[] = [];
  for (const f of [...(org[purposeKey] ?? []), ...(event[purposeKey] ?? [])]) {
    try {
      const [buffer] = await billsBucket.file(f.path).download();
      out.push({ buffer, filename: f.name, mimeType: f.type });
    } catch (err) {
      console.error(`[email-files] ${f.path} missing`, String(err));
    }
  }
  return out;
}

/** The same for an event: its organization looked up. */
export async function eventTemplateFiles(eventId: string, purposeKey: string) {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
  return templateFiles(e.organizationId, eventId, purposeKey);
}
