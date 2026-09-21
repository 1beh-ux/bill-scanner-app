import type { docs_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getDocsClient, toDriveError } from "@/lib/drive";
import { DriveError, type DriveErrorParams } from "@/lib/drive-errors";
import { extractGoogleDocId } from "@/lib/document-merge";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// Event-level keys document merge always resolves (see resolveVariables in
// src/lib/document-variables.ts) -- not participant fields, so never "unmapped".
const EVENT_KEYS = new Set(["camp_name", "questionnaire_url"]);
const VALID_KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export type PlaceholderStatus = "ok" | "field_off" | "unknown" | "invalid";

export interface TemplatePlaceholder {
  key: string;
  status: PlaceholderStatus;
  // {{ key }} with spaces inside is never replaced by the merge (exact match).
  hasSpaces: boolean;
}

export interface TemplateCheckResult {
  // `error` is a DriveErrorCode (rendered as driveSettings.error.<code> with errorParams)
  templates: { docTypeId: string; name: string; docId?: string; error?: string; errorParams?: DriveErrorParams; placeholders: TemplatePlaceholder[] }[];
  // Fields marked for documents that no readable template uses (with a
  // single-template check: that one template).
  unusedFields: { key: string; label: string }[];
}

function collectParagraphs(content: docs_v1.Schema$StructuralElement[] | undefined, out: string[]) {
  for (const el of content ?? []) {
    if (el.paragraph) out.push((el.paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join(""));
    for (const row of el.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) collectParagraphs(cell.content, out);
    }
  }
}

function collectTabs(tabs: docs_v1.Schema$Tab[] | undefined, out: string[]) {
  for (const tab of tabs ?? []) {
    const d = tab.documentTab;
    if (d) {
      collectParagraphs(d.body?.content, out);
      for (const h of Object.values(d.headers ?? {})) collectParagraphs(h.content, out);
      for (const f of Object.values(d.footers ?? {})) collectParagraphs(f.content, out);
    }
    collectTabs(tab.childTabs, out);
  }
}

async function readPlaceholders(eventId: string, templateDocId: string): Promise<{ key: string; hasSpaces: boolean }[]> {
  const docs = await getDocsClient(eventId);
  let doc;
  try {
    doc = await docs.documents.get({ documentId: extractGoogleDocId(templateDocId), includeTabsContent: true });
  } catch (err) {
    throw await toDriveError(eventId, err, { purpose: "read" });
  }
  const paragraphs: string[] = [];
  collectTabs(doc.data.tabs, paragraphs);
  // Joined per paragraph, so a placeholder Google split across text runs
  // (after formatting edits) is still found.
  const found = new Map<string, boolean>();
  for (const text of paragraphs) {
    for (const m of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
      const key = m[1].trim();
      found.set(key, (found.get(key) ?? false) || m[1] !== key);
    }
  }
  return [...found].map(([key, hasSpaces]) => ({ key, hasSpaces }));
}

export async function checkEventTemplates(eventId: string, opts: { docTypeId?: string } = {}): Promise<TemplateCheckResult> {
  const [docTypes, fields] = await Promise.all([
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true, ...(opts.docTypeId && { id: opts.docTypeId }) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.eventParticipantField.findMany({ where: { eventId } }),
  ]);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const templates: TemplateCheckResult["templates"] = [];
  const usedKeys = new Set<string>();

  for (const dt of docTypes) {
    const templateId = (dt.data as DocumentTypeData | null)?.templateGoogleDocId;
    if (!templateId) continue;
    try {
      const found = await readPlaceholders(eventId, templateId);
      templates.push({
        docTypeId: dt.id,
        name: dt.name,
        docId: extractGoogleDocId(templateId),
        placeholders: found.map(({ key, hasSpaces }) => {
          usedKeys.add(key);
          const field = byKey.get(key);
          let status: PlaceholderStatus;
          if (EVENT_KEYS.has(key) || (field && field.active && field.surfaces.includes("documents"))) status = "ok";
          else if (field) status = "field_off";
          else status = VALID_KEY.test(key) ? "unknown" : "invalid";
          return { key, status, hasSpaces };
        }),
      });
    } catch (err) {
      const known = err instanceof DriveError ? err : null;
      if (!known) console.error("[template-check] unexpected error:", err);
      templates.push({
        docTypeId: dt.id,
        name: dt.name,
        error: known?.code ?? "drive_unknown",
        errorParams: known?.params,
        placeholders: [],
      });
    }
  }

  const unusedFields = fields
    .filter((f) => f.active && f.surfaces.includes("documents") && !usedKeys.has(f.key))
    .map((f) => ({ key: f.key, label: f.label }));

  return { templates, unusedFields };
}

/**
 * Makes the given placeholder keys resolvable: enables the documents surface
 * on a field that already exists, otherwise creates a plain text custom
 * field. Keys that aren't valid field names are skipped.
 */
export async function applyTemplateKeys(eventId: string, keys: string[]): Promise<{ enabled: number; created: number; skipped: number }> {
  let enabled = 0;
  let created = 0;
  let skipped = 0;
  for (const key of new Set(keys)) {
    const existing = await prisma.eventParticipantField.findUnique({ where: { eventId_key: { eventId, key } } });
    if (existing) {
      await prisma.eventParticipantField.update({
        where: { id: existing.id },
        data: { active: true, surfaces: [...new Set([...existing.surfaces, "documents" as const])] },
      });
      enabled++;
    } else if (VALID_KEY.test(key)) {
      await prisma.eventParticipantField.create({
        data: { eventId, key, label: key, fieldType: "text", surfaces: ["documents"], isFromTemplate: false },
      });
      created++;
    } else {
      skipped++;
    }
  }
  return { enabled, created, skipped };
}
