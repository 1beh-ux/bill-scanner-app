// Templates on three levels (organizations step 4): app (organization_id NULL) ->
// organization -> event. An organization's template made from an app template keeps
// sourceTemplateId = that app row. Nothing is ever pushed down automatically: an
// organization restores one item ("Obnovit z aplikace") or loads the app items it
// doesn't have yet ("Načíst nové z aplikace"); a new organization starts with copies.
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type TemplateTable = "category" | "list" | "email" | "field";
export const TEMPLATE_TABLES: TemplateTable[] = ["category", "list", "email", "field"];
export type SyncStatus = "default" | "modified" | "custom";
type Row = Record<string, unknown> & { id: string; organizationId: string | null; sourceTemplateId: string | null };
type Db = Prisma.TransactionClient | typeof prisma;

/** Per table: the content fields (copied, compared, restored) and what makes two rows "the same item". */
const SPEC: Record<TemplateTable, { fields: string[]; identity: (r: Record<string, unknown>) => string; filterKey?: string }> = {
  category: { fields: ["name", "description"], identity: (r) => String(r.name) },
  list: { fields: ["kind", "name", "key", "sortOrder", "data", "active"], identity: (r) => `${r.kind}|${r.name}`, filterKey: "kind" },
  email: { fields: ["purposeKey", "subject", "body"], identity: (r) => String(r.purposeKey), filterKey: "purposeKey" },
  field: {
    fields: ["key", "label", "fieldType", "options", "defaultSurfaces", "active", "portalAccess", "requiredInRegistration", "audience", "level"],
    identity: (r) => String(r.key),
  },
};

// The four delegates differ only in their row types; one cast keeps one code path.
type Delegate = {
  findMany(args: { where: Record<string, unknown> }): Promise<Row[]>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Row | null>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>;
};
const delegate = (db: Db, table: TemplateTable): Delegate =>
  ({ category: db.categoryTemplate, list: db.listTemplate, email: db.emailTemplate, field: db.participantFieldTemplate })[table] as unknown as Delegate;

/** Stable comparison: JSON with sorted object keys, null == undefined. */
function canon(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const content = (table: TemplateTable, r: Record<string, unknown>) => Object.fromEntries(SPEC[table].fields.map((f) => [f, r[f] ?? null]));
const toData = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null && (k === "data" || k === "options") ? undefined : x]));

/** Fields of `row` that differ from `source` (what "Porovnat" shows). */
export function diffFields(table: TemplateTable, row: Record<string, unknown>, source: Record<string, unknown>) {
  return SPEC[table].fields.filter((f) => canon(row[f]) !== canon(source[f])).map((f) => ({ field: f, current: row[f] ?? null, app: source[f] ?? null }));
}

const filterWhere = (table: TemplateTable, filter: string | null) => (filter && SPEC[table].filterKey ? { [SPEC[table].filterKey!]: filter } : {});

/** The organization's items with their badge: equal to the app source, changed, or its own. */
export async function syncStatus(table: TemplateTable, organizationId: string, filter: string | null) {
  const d = delegate(prisma, table);
  const rows = await d.findMany({ where: { organizationId, ...filterWhere(table, filter) } });
  const sourceIds = rows.map((r) => r.sourceTemplateId).filter((x): x is string => !!x);
  const sources = new Map((sourceIds.length ? await d.findMany({ where: { id: { in: sourceIds }, organizationId: null } }) : []).map((s) => [s.id, s]));
  return rows.map((r) => {
    const source = r.sourceTemplateId ? sources.get(r.sourceTemplateId) : undefined;
    const diff = source ? diffFields(table, r, source) : [];
    const status: SyncStatus = !source ? "custom" : diff.length ? "modified" : "default";
    return { id: r.id, label: String(r.name ?? r.label ?? r.purposeKey ?? r.key ?? r.id), status, diff };
  });
}

/** "Obnovit z aplikace": the organization's item takes its app source's content again. */
export async function restoreFromApp(table: TemplateTable, organizationId: string, id: string): Promise<boolean> {
  const d = delegate(prisma, table);
  const row = await d.findFirst({ where: { id, organizationId } });
  const source = row?.sourceTemplateId ? await d.findFirst({ where: { id: row.sourceTemplateId, organizationId: null } }) : null;
  if (!row || !source) return false;
  await d.update({ where: { id }, data: toData(content(table, source)) });
  return true;
}

/**
 * "Načíst nové z aplikace" (and a new organization's start): copies the app items the
 * organization doesn't have yet -- not copied before, and no own item that is the same
 * (same name / kind+name / purpose / key). Returns how many were copied.
 */
export async function pullFromApp(db: Db, table: TemplateTable, organizationId: string, filter: string | null): Promise<number> {
  const d = delegate(db, table);
  const [app, own] = await Promise.all([
    d.findMany({ where: { organizationId: null, ...filterWhere(table, filter) } }),
    d.findMany({ where: { organizationId, ...filterWhere(table, filter) } }),
  ]);
  const copied = new Set(own.map((r) => r.sourceTemplateId).filter(Boolean));
  const same = new Set(own.map((r) => SPEC[table].identity(r)));
  let created = 0;
  for (const a of app) {
    if (copied.has(a.id) || same.has(SPEC[table].identity(a)) || a.active === false) continue;
    await d.create({ data: { ...toData(content(table, a)), organizationId, sourceTemplateId: a.id } });
    created++;
  }
  return created;
}

/** A new organization: copies of every active app template, in all four tables. */
export async function copyAppTemplatesToOrganization(db: Db, organizationId: string): Promise<Record<TemplateTable, number>> {
  const out = {} as Record<TemplateTable, number>;
  for (const table of TEMPLATE_TABLES) out[table] = await pullFromApp(db, table, organizationId, null);
  return out;
}

// --- scripts/create-app-templates.ts: an organization's templates become the app's starter set.

/** Values that look organization-specific, for a person to review in Šablony aplikace. */
export function flagOrgSpecific(text: string): string[] {
  const hits: string[] = [];
  const add = (label: string, re: RegExp) => {
    for (const m of text.matchAll(re)) hits.push(`${label}: ${m[0]}`);
  };
  add("Google Doc", /docs\.google\.com\/[^\s"')]+|\b1[A-Za-z0-9_-]{30,}\b/g);
  add("IBAN", /\bCZ\d{2}(?:\s?\d{4}){5}\b/g);
  add("bank account", /\b(?:\d{1,6}-)?\d{2,10}\/\d{4}\b/g);
  add("e-mail", /[\w.+-]+@[\w-]+\.[\w.-]+/g);
  add("URL", /https?:\/\/[^\s"')]+/g);
  add("phone", /(?:\+420\s?)?\b\d{3}\s?\d{3}\s?\d{3}\b/g);
  add("name", /\b(?:Záře|Zář[ei]|Pionýr\w*|Meziměstí)\b/gi);
  return [...new Set(hits)];
}

/** For the app copy: Google Doc ids and bank details dropped from a JSON `data`/`options`. */
export function clearOrgSettings(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clearOrgSettings);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !/doc_?id|googledoc|bank|iban|account/i.test(k))
      .map(([k, x]) => [k, clearOrgSettings(x)])
  );
}

export const tableSpec = (table: TemplateTable) => SPEC[table];
export const templateContent = content;
export const templateDelegate = delegate;
export const templateData = toData;
