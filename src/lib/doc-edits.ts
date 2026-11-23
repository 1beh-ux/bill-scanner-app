// Fields Manager phase 6 (design §11): Google Docs template edits -- the pure half. Reads a documents.get result
// into paragraphs with exact positions, finds placeholders (and ones it can't locate exactly), and turns queued edits
// into ONE batchUpdate: ranged edits first in descending order, then position-free replaceAllText.
// Nothing here talks to Google; the edits are always planned from a fresh read.
import type { docs_v1 } from "googleapis";

export type Para = { text: string; start: number; tabId?: string; segmentId?: string; where: "body" | "header" | "footer" };
export type Placeholder = { raw: string; key: string; hasSpaces: boolean; start: number; end: number; tabId?: string; segmentId?: string; where: Para["where"] };
export type DocEdit =
  | { type: "rename"; from: string; to: string } // {{from}} (and "{{ from }}") -> {{to}}; from === to only fixes spaces
  | { type: "typed"; text: string; key: string }; // typed text -> {{key}}, every exact occurrence

const OBJ = "￼"; // a non-text element (image, page break...) keeps its length so offsets stay exact

function walk(content: docs_v1.Schema$StructuralElement[] | undefined, base: Omit<Para, "text" | "start">, out: Para[]) {
  for (const el of content ?? []) {
    if (el.paragraph) {
      const els = el.paragraph.elements ?? [];
      if (!els.length) continue;
      const start = els[0].startIndex ?? 0;
      let text = "";
      for (const e of els) text += e.textRun?.content ?? OBJ.repeat(Math.max(0, (e.endIndex ?? 0) - (e.startIndex ?? 0)));
      out.push({ ...base, text, start });
    }
    for (const row of el.table?.tableRows ?? []) for (const cell of row.tableCells ?? []) walk(cell.content, base, out);
  }
}

/** Every paragraph of every tab (body, headers, footers, tables), with its start index. Pure. */
export function docParagraphs(doc: docs_v1.Schema$Document): Para[] {
  const out: Para[] = [];
  const tabs = (list: docs_v1.Schema$Tab[] | undefined) => {
    for (const tab of list ?? []) {
      const d = tab.documentTab;
      const tabId = tab.tabProperties?.tabId ?? undefined;
      if (d) {
        walk(d.body?.content, { tabId, where: "body" }, out);
        for (const [id, h] of Object.entries(d.headers ?? {})) walk(h.content, { tabId, segmentId: id, where: "header" }, out);
        for (const [id, f] of Object.entries(d.footers ?? {})) walk(f.content, { tabId, segmentId: id, where: "footer" }, out);
      }
      tabs(tab.childTabs);
    }
  };
  if (doc.tabs?.length) tabs(doc.tabs);
  else {
    walk(doc.body?.content, { where: "body" }, out);
    for (const [id, h] of Object.entries(doc.headers ?? {})) walk(h.content, { segmentId: id, where: "header" }, out);
    for (const [id, f] of Object.entries(doc.footers ?? {})) walk(f.content, { segmentId: id, where: "footer" }, out);
  }
  return out;
}

/** Placeholders found whole inside one paragraph (formatting runs don't matter: the paragraph text is joined). */
export function findPlaceholders(paras: Para[]): Placeholder[] {
  return paras.flatMap((p) =>
    [...p.text.matchAll(/\{\{([^{}\n]*)\}\}/g)].map((m) => ({
      raw: m[0],
      key: m[1].trim(),
      hasSpaces: m[1] !== m[1].trim(),
      start: p.start + m.index!,
      end: p.start + m.index! + m[0].length,
      tabId: p.tabId,
      segmentId: p.segmentId,
      where: p.where,
    })),
  );
}

/** Pieces of a placeholder the manager can't locate exactly (opened in one paragraph, closed in another). */
export function brokenPlaceholders(paras: Para[]): string[] {
  const out: string[] = [];
  for (const p of paras) {
    const rest = p.text.replace(/\{\{[^{}\n]*\}\}/g, "");
    const open = rest.match(/\{\{[^{}]*$/);
    const close = rest.match(/^[^{}]*\}\}/);
    if (open) out.push(open[0].trim());
    if (close) out.push(close[0].trim());
  }
  return out;
}

/** Exact occurrences of typed text (not inside a placeholder). */
export function textOccurrences(paras: Para[], text: string): { start: number; end: number; tabId?: string; segmentId?: string }[] {
  if (!text) return [];
  const out: { start: number; end: number; tabId?: string; segmentId?: string }[] = [];
  for (const p of paras) {
    const masked = p.text.replace(/\{\{[^{}\n]*\}\}/g, (m) => "\u0000".repeat(m.length));
    for (let i = masked.indexOf(text); i >= 0; i = masked.indexOf(text, i + text.length)) out.push({ start: p.start + i, end: p.start + i + text.length, tabId: p.tabId, segmentId: p.segmentId });
  }
  return out;
}

/** Queued edits -> one batchUpdate's requests, from a fresh read. `missing` = edits with nothing to change. */
export function buildRequests(edits: DocEdit[], paras: Para[]): { requests: docs_v1.Schema$Request[]; missing: number[] } {
  const ranged: { start: number; reqs: docs_v1.Schema$Request[] }[] = [];
  const replaceAll: docs_v1.Schema$Request[] = [];
  const missing: number[] = [];
  const taken: { seg: string; start: number; end: number }[] = [];
  const found = findPlaceholders(paras);
  const replace = (from: string, to: string) => replaceAll.push({ replaceAllText: { containsText: { text: from, matchCase: true }, replaceText: to } });
  edits.forEach((e, i) => {
    if (e.type === "rename") {
      const hits = found.filter((p) => p.key === e.from && (p.raw !== `{{${e.to}}}`));
      if (!hits.length) return void missing.push(i);
      for (const raw of new Set(hits.map((p) => p.raw))) replace(raw, `{{${e.to}}}`);
      return;
    }
    // Overlapping typed edits ("Testov" and "Testov u Prahy"): the first queued wins, the other skips that spot.
    const at = textOccurrences(paras, e.text).filter((o) => !taken.some((t) => t.seg === `${o.tabId}|${o.segmentId}` && o.start < t.end && t.start < o.end));
    if (!at.length) return void missing.push(i);
    for (const o of at) {
      taken.push({ seg: `${o.tabId}|${o.segmentId}`, start: o.start, end: o.end });
      const loc = { ...(o.tabId && { tabId: o.tabId }), ...(o.segmentId && { segmentId: o.segmentId }) };
      ranged.push({
        start: o.start,
        reqs: [{ deleteContentRange: { range: { startIndex: o.start, endIndex: o.end, ...loc } } }, { insertText: { location: { index: o.start, ...loc }, text: `{{${e.key}}}` } }],
      });
    }
  });
  // Ranged edits first, from the end backwards (earlier positions stay valid), then the position-free ones.
  ranged.sort((a, b) => b.start - a.start);
  return { requests: [...ranged.flatMap((r) => r.reqs), ...replaceAll], missing };
}

/** One string per edit, independent of key order (Postgres JSONB reorders object keys). */
export const editKey = (e: DocEdit) => (e.type === "rename" ? `rename|${e.from}|${e.to}` : `typed|${e.text}|${e.key}`);

/** Untrusted body -> an edit, or null. */
export function readEdit(v: unknown): DocEdit | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const key = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/;
  if (o.type === "rename" && typeof o.from === "string" && typeof o.to === "string" && o.from.length <= 80 && key.test(o.to)) return { type: "rename", from: o.from, to: o.to };
  if (o.type === "typed" && typeof o.text === "string" && o.text.trim().length >= 2 && o.text.length <= 200 && typeof o.key === "string" && key.test(o.key)) return { type: "typed", text: o.text, key: o.key };
  return null;
}
