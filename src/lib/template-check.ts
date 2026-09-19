import type { docs_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getDocsClient } from "@/lib/drive";
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
  templates: { docTypeId: string; name: string; error?: string; placeholders: TemplatePlaceholder[] }[];
  // Fields marked for documents that no readable template uses.
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

async function readPlaceholders(templateDocId: string): Promise<{ key: string; hasSpaces: boolean }[]> {
  const docs = await getDocsClient();
  const doc = await docs.documents.get({ documentId: extractGoogleDocId(templateDocId), includeTabsContent: true });
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

export async function checkEventTemplates(eventId: string): Promise<TemplateCheckResult> {
  const [docTypes, fields] = await Promise.all([
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.eventParticipantField.findMany({ where: { eventId } }),
  ]);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const templates: TemplateCheckResult["templates"] = [];
  const usedKeys = new Set<string>();

  for (const dt of docTypes) {
    const templateId = (dt.data as DocumentTypeData | null)?.templateGoogleDocId;
    if (!templateId) continue;
    try {
      const found = await readPlaceholders(templateId);
      templates.push({
        docTypeId: dt.id,
        name: dt.name,
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
      templates.push({ docTypeId: dt.id, name: dt.name, error: String(err).slice(0, 200), placeholders: [] });
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
