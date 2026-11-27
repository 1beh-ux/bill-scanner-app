// Sheet exports (2026-11-27): a Google Sheet kept up to date from the app -- participants or bills, the chosen
// columns in their order (all when none chosen), rewritten in place. One-way: the app never reads it back.
// The sheet: a pasted link, else a new one in the event's export folder (participants list / bills export folder).
// Runs: on demand, on a schedule (every N hours / daily at HH:MM Prague time, dueExports) and when participants reach
// one of its conditions (src/lib/automation.ts).
import { prisma } from "@/lib/prisma";
import { withMembers } from "@/lib/children";
import { fieldTextValues } from "@/lib/document-variables";
import { compareParticipantsBySurname } from "@/lib/participant-name";
import { createManifestSheet, sheetText, writeManifestValues } from "@/lib/drive";
import { exportFolder } from "@/lib/drive-folders";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { docState } from "@/lib/registration-status";
import { profileDocuments } from "@/lib/person-documents";
import { detailsDocuments } from "@/lib/details-documents";
import { currentConditions } from "@/lib/automation";
import { requiredEventFields, templateRules } from "@/lib/portal-server";
import { askedFields } from "@/lib/registration-fields";

export type ExportKind = "participants" | "bills";
// used: worth exporting in this event (2026-11-27) -- a new export starts with these ticked.
export type ExportColumn = { key: string; label: string; used?: boolean };

const DOC_TEXT = { received: "přijato", pending: "ke kontrole", rejected: "zamítnuto", none: "chybí" } as const;
const BILL_COLUMNS: ExportColumn[] = [
  { key: "billDate", label: "Datum" },
  { key: "merchantName", label: "Obchodník" },
  { key: "totalAmount", label: "Částka" },
  { key: "currency", label: "Měna" },
  { key: "amountCzk", label: "Částka v Kč" },
  { key: "categories", label: "Kategorie" },
  { key: "payer", label: "Platil" },
  { key: "paymentChannel", label: "Způsob platby" },
  { key: "paid", label: "Proplaceno" },
  { key: "status", label: "Stav" },
  { key: "notes", label: "Poznámka" },
  { key: "file", label: "Soubor" },
];
const BILL_STATUS: Record<string, string> = { approved: "schváleno", auto_approved: "schváleno automaticky", to_review: "ke kontrole", failed: "chyba", new: "nový", queued: "ve frontě", processing: "zpracovává se" };

/** The columns an export of this kind can have, in their default order. */
export async function availableColumns(eventId: string, kind: ExportKind): Promise<ExportColumn[]> {
  if (kind === "bills") return BILL_COLUMNS.map((c) => ({ ...c, used: true }));
  const [fields, docs, participants, event, eventFields, rules] = await Promise.all([
    prisma.eventParticipantField.findMany({ where: { eventId, active: true, NOT: { fieldType: "image" } }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { key: true, label: true, kind: true, computedType: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.participant.findMany({ where: { eventId }, select: { customFieldValues: true, _count: { select: { guardians: true } } } }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true, memberPriceCzk: true, nonMemberPriceCzk: true, priceRules: true } }),
    requiredEventFields([eventId]),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } }).then((e) => templateRules(e.organizationId)),
  ]);
  // Used in this event: asked on its form, filled in for somebody, or one of the always-useful built-in ones.
  const asked = new Set(askedFields(eventFields, rules).map((f) => f.key));
  const filled = new Set(participants.flatMap((p) => Object.entries((p.customFieldValues as Record<string, unknown> | null) ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k]) => k)));
  const hasGuardians = participants.some((p) => p._count.guardians > 0);
  const priced = event.memberPriceCzk != null || event.nonMemberPriceCzk != null || !!event.priceRules;
  const used = (f: (typeof fields)[number]) =>
    f.kind === "builtin"
      ? ["Name", "participant_first_name", "participant_last_name", "datum_narozeni"].includes(f.key)
      : f.kind === "guardian"
        ? hasGuardians && f.key !== "zak_zast_jmeno"
        : f.kind === "computed"
          ? f.computedType === "contact_email" || (priced && (f.computedType === "effective_price" || f.computedType === "variable_symbol"))
          : asked.has(f.key) || filled.has(f.key);
  return [
    { key: "status", label: "Přihláška", used: true },
    { key: "complete", label: "Kompletní", used: true },
    { key: "registeredAt", label: "Přihlášen(a)", used: true },
    ...fields.map((f) => ({ key: `f:${f.key}`, label: f.label, used: used(f) })),
    ...docs.filter((d) => !(d.data as DocumentTypeData | null)?.staticAttachment).map((d) => ({ key: `doc:${d.id}`, label: documentDisplayName({ ...d, data: d.data as DocumentTypeData | null }), used: true })),
  ];
}

const pick = (all: ExportColumn[], chosen: string[]) => (chosen.length ? chosen.map((k) => all.find((c) => c.key === k)).filter((c): c is ExportColumn => !!c) : all);
const date = (d: Date | null) => (d ? d.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" }) : "");

async function participantRows(eventId: string, chosen: string[]): Promise<string[][]> {
  const event = await withMembers(await prisma.event.findUniqueOrThrow({ where: { id: eventId } }));
  const [cols, fields, participants, conditions] = await Promise.all([
    availableColumns(eventId, "participants").then((all) => pick(all, chosen)),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true } }),
    prisma.participant.findMany({ where: { eventId, active: true }, include: { guardians: true, documents: true } }),
    currentConditions(eventId),
  ]);
  const [fromProfile, fromDetails] = await Promise.all([profileDocuments(participants), detailsDocuments(participants.map((p) => p.id))]);
  participants.sort(compareParticipantsBySurname);
  return [
    cols.map((c) => c.label),
    ...participants.map((p) => {
      const values = fieldTextValues({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event, fields);
      const docs = [...p.documents, ...(fromProfile.get(p.id) ?? []), ...(fromDetails.get(p.id) ?? [])];
      return cols.map((c) => {
        if (c.key === "status") return p.registrationStatus === "accepted" ? "přijatá" : "čeká";
        if (c.key === "complete") return conditions.get(p.id)?.has("complete") ? "ano" : "ne";
        if (c.key === "registeredAt") return date(p.createdAt);
        if (c.key.startsWith("f:")) return sheetText(values[c.key.slice(2)] ?? "");
        if (c.key.startsWith("doc:")) return DOC_TEXT[docState(docs, c.key.slice(4)).state];
        return "";
      });
    }),
  ];
}

async function billRows(eventId: string, chosen: string[]): Promise<(string | number)[][]> {
  const cols = pick(BILL_COLUMNS, chosen);
  const bills = await prisma.bill.findMany({
    where: { eventId },
    orderBy: [{ billDate: "asc" }, { createdAt: "asc" }],
    include: { categories: { include: { eventCategory: { select: { name: true } } } }, payerAuthor: { select: { canonicalName: true } } },
  });
  return [
    cols.map((c) => c.label),
    ...bills.map((b) =>
      cols.map((c) => {
        switch (c.key) {
          case "billDate": return date(b.billDate);
          case "merchantName": return sheetText(b.merchantName ?? "");
          case "totalAmount": return b.totalAmount ? Number(b.totalAmount) : "";
          case "currency": return b.currency;
          case "amountCzk": return b.amountCzk ? Number(b.amountCzk) : "";
          case "categories": return b.categories.map((x) => x.eventCategory.name).join(", ");
          case "payer": return b.payerAuthor?.canonicalName ?? "";
          case "paymentChannel": return b.paymentChannel ?? "";
          case "paid": return b.paidAt ? date(b.paidAt) : "";
          case "status": return BILL_STATUS[b.status] ?? b.status;
          case "notes": return sheetText(b.notes ?? "");
          case "file": return b.exportFilename ?? b.displayFilename ?? b.originalFilename;
          default: return "";
        }
      }),
    ),
  ];
}

/** Writes one export now. Records the result on the export; returns it (never throws). */
export async function runSheetExport(id: string): Promise<{ ok: boolean; sheetId?: string; rows?: number; error?: string }> {
  const x = await prisma.sheetExport.findUnique({ where: { id }, include: { event: true } });
  if (!x) return { ok: false, error: "not_found" };
  try {
    const rows = x.kind === "bills" ? await billRows(x.eventId, x.columns) : await participantRows(x.eventId, x.columns);
    let sheetId = x.sheetId;
    if (sheetId) await writeManifestValues(x.eventId, sheetId, rows);
    else {
      const folder = exportFolder(x.event, x.kind === "bills" ? "manifest" : "participantsList");
      if (!folder) throw new Error("no_export_folder");
      sheetId = await createManifestSheet(x.eventId, folder, `${x.name} – ${x.event.name}`, rows);
    }
    await prisma.sheetExport.update({ where: { id }, data: { sheetId, lastRunAt: new Date(), lastError: null } });
    return { ok: true, sheetId, rows: rows.length - 1 };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? (err instanceof Error ? err.message : String(err));
    await prisma.sheetExport.update({ where: { id }, data: { lastRunAt: new Date(), lastError: String(code).slice(0, 200) } });
    return { ok: false, error: String(code).slice(0, 200) };
  }
}

/** Prague wall clock (hours, minutes) and today's date there. */
function pragueNow(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Scheduled exports due now: every N hours since the last run, or daily once the time of day has passed. */
export function isDue(x: { everyHours: number | null; dailyAt: string | null; lastRunAt: Date | null }, now: Date): boolean {
  if (x.everyHours && (!x.lastRunAt || now.getTime() - x.lastRunAt.getTime() >= x.everyHours * 3600_000 - 60_000)) return true;
  if (x.dailyAt && /^\d{1,2}:\d{2}$/.test(x.dailyAt)) {
    const [h, m] = x.dailyAt.split(":").map(Number);
    const p = pragueNow(now);
    if (p.minutes < h * 60 + m) return false;
    return !x.lastRunAt || pragueNow(x.lastRunAt).day !== p.day || pragueNow(x.lastRunAt).minutes < h * 60 + m;
  }
  return false;
}

export async function dueExports(now = new Date()): Promise<string[]> {
  const rows = await prisma.sheetExport.findMany({ where: { active: true, event: { status: "active" }, OR: [{ everyHours: { not: null } }, { dailyAt: { not: null } }] }, select: { id: true, everyHours: true, dailyAt: true, lastRunAt: true } });
  return rows.filter((x) => isDue(x, now)).map((x) => x.id);
}
