// Nastavení akce -> Pošta / Exporty (2026-11-27, src/lib/automation.ts): automatic e-mails, the CC rule and per
// template CC choice, and the Sheet exports of one event.
//   GET -> everything the screens need
//   POST { action, ... }:
//     addRule {condition, purposeKey, sendToExisting?} | setRule {id, active} | deleteRule {id}
//     saveCc {ccRule: {fieldKey, map, noticeSubject, noticeBody} | null} | setEmailCc {purposeKey, mode: "copy"|"notice"|null}
//     saveExport {id?, name, kind, sheetUrl?, columns, everyHours?, dailyAt?, conditions, active} | deleteExport {id} | runExport {id}
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { customTemplatesOf } from "@/lib/custom-email-templates";
import { BASE_CONDITIONS, baselineMarks, docCondition } from "@/lib/automation";
import { readCcRule, readEmailCc } from "@/lib/email-cc";
import { availableColumns, runSheetExport } from "@/lib/sheet-export";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx): Promise<{ denied: NextResponse } | { eventId: string }> {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId } = await ctx.params;
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "mail"]);
  return denied ? { denied } : { eventId };
}

async function view(eventId: string) {
  const [event, docs, rules, templates, selectFields, exports, participantColumns, billColumns] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { ccRule: true, emailCc: true, paymentDocTypeId: true, senderEmail: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.mailRule.findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { sends: true } } } }),
    customTemplatesOf(eventId),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true, fieldType: "select" }, select: { key: true, label: true, options: true } }),
    prisma.sheetExport.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }),
    availableColumns(eventId, "participants"),
    availableColumns(eventId, "bills"),
  ]);
  const tracked = docs.filter((d) => !(d.data as DocumentTypeData | null)?.staticAttachment);
  return {
    hasSender: !!event.senderEmail,
    conditions: [
      ...BASE_CONDITIONS.filter((c) => c !== "paid" || !!event.paymentDocTypeId).map((c) => ({ key: c, label: null as string | null })),
      ...tracked.map((d) => ({ key: docCondition(d.id), label: documentDisplayName({ ...d, data: d.data as DocumentTypeData | null }) })),
    ],
    templates: templates.map((t) => ({ purposeKey: t.purposeKey, name: t.name })),
    rules: rules.map((r) => ({ id: r.id, condition: r.condition, purposeKey: r.purposeKey, active: r.active, sent: r._count.sends, createdAt: r.createdAt })),
    ccRule: readCcRule(event.ccRule),
    emailCc: readEmailCc(event.emailCc),
    selectFields: selectFields.map((f) => ({ key: f.key, label: f.label, options: Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === "string") : [] })),
    exports: exports.map((x) => ({ ...x, sheetUrl: x.sheetId ? `https://docs.google.com/spreadsheets/d/${x.sheetId}` : null })),
    columns: { participants: participantColumns, bills: billColumns },
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  return NextResponse.json(await view(g.eventId));
}

const bad = (error = "invalid") => NextResponse.json({ error }, { status: 400 });
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const eventId = g.eventId;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const current = await view(eventId);
  const validCondition = (c: unknown) => typeof c === "string" && current.conditions.some((x) => x.key === c);

  switch (b.action) {
    case "addRule": {
      if (!validCondition(b.condition) || !current.templates.some((t) => t.purposeKey === b.purposeKey)) return bad();
      // New rule: people who already meet the condition are recorded first, so only new ones get the e-mail --
      // unless "send to those who already meet it" (then the rule counts from the beginning).
      if (b.sendToExisting !== true) await baselineMarks(eventId);
      await prisma.mailRule.create({ data: { eventId, condition: b.condition as string, purposeKey: b.purposeKey as string, ...(b.sendToExisting === true && { createdAt: new Date(0) }) } });
      break;
    }
    case "setRule":
      if (typeof b.id !== "string" || typeof b.active !== "boolean") return bad();
      // Switched back on: from now on (what happened while it was off isn't sent afterwards).
      if (b.active) await baselineMarks(eventId);
      await prisma.mailRule.updateMany({ where: { id: b.id, eventId }, data: { active: b.active, ...(b.active && { createdAt: new Date() }) } });
      break;
    case "deleteRule":
      if (typeof b.id !== "string") return bad();
      await prisma.mailRule.deleteMany({ where: { id: b.id, eventId } });
      break;
    case "saveCc": {
      const rule = b.ccRule === null ? null : readCcRule(b.ccRule);
      if (b.ccRule !== null && !rule) return bad();
      await prisma.event.update({ where: { id: eventId }, data: { ccRule: rule ? (rule as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
      break;
    }
    case "setEmailCc": {
      const key = str(b.purposeKey, 100);
      if (!key || (b.mode !== null && b.mode !== "copy" && b.mode !== "notice")) return bad();
      const next = { ...current.emailCc };
      if (b.mode) next[key] = b.mode;
      else delete next[key];
      await prisma.event.update({ where: { id: eventId }, data: { emailCc: next } });
      break;
    }
    case "saveExport": {
      const kind = b.kind === "bills" ? "bills" : b.kind === "participants" ? "participants" : null;
      const name = str(b.name, 100);
      if (!kind || !name) return bad();
      const allowed = new Set(current.columns[kind].map((c) => c.key));
      const columns = Array.isArray(b.columns) ? [...new Set(b.columns.filter((c): c is string => typeof c === "string" && allowed.has(c)))] : [];
      const conditions = kind === "participants" && Array.isArray(b.conditions) ? [...new Set(b.conditions.filter(validCondition) as string[])] : [];
      const everyHours = typeof b.everyHours === "number" && b.everyHours >= 1 && b.everyHours <= 168 ? Math.round(b.everyHours) : null;
      const dailyAt = typeof b.dailyAt === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(b.dailyAt) ? b.dailyAt : null;
      const sheetId = str(b.sheetUrl, 300).match(/[-\w]{25,}/)?.[0] ?? null;
      const data = { name, kind, columns, conditions, everyHours, dailyAt, active: b.active !== false, ...(b.sheetUrl !== undefined && { sheetId }) };
      if (typeof b.id === "string") await prisma.sheetExport.updateMany({ where: { id: b.id, eventId }, data });
      else await prisma.sheetExport.create({ data: { eventId, ...data } });
      break;
    }
    case "deleteExport":
      if (typeof b.id !== "string") return bad();
      await prisma.sheetExport.deleteMany({ where: { id: b.id, eventId } });
      break;
    case "runExport": {
      if (typeof b.id !== "string" || !current.exports.some((x) => x.id === b.id)) return bad();
      const r = await runSheetExport(b.id);
      return NextResponse.json({ ...(await view(eventId)), run: r });
    }
    default:
      return bad();
  }
  return NextResponse.json(await view(eventId));
}
