// Pole -> Formulář (rethink 2026-11-24): the event's form as the applicant sees it, and its changes.
//   GET   ?event=                                         -> FormStructure
//   PATCH {event, key, change: {ask, required, audience, when, label, hint}}   -> one question
//   PATCH {event, text: {scope, key, value}}              -> wording of one of the form's own texts (this event)
//   PATCH {event, reset: true}                            -> back to today's rules (portal-derived) for the event
//   PATCH {event, key, requiredDefault: bool}               -> the organization's default (events that had the old one follow)
//   PATCH {event, order: {place, keys}}                     -> drag & drop: the questions of one place in this order
//   PATCH {event, guardian: {key, change}}                  -> a guardian question in this event (ask/required/label/hint)
//   PATCH {event, guardian: {key, requiredDefault}}          -> its organization default
//   PATCH {event, guardianField: {action: create|update|delete, ...}} -> the organization's own guardian fields
// Admins of a flagged organization only; every change logged.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeQuestion, formStructure, reorderQuestions, resetForm, setFormText, setOrgRequired } from "@/lib/form-structure";
import { changeGuardianQuestion, createGuardianField, deleteGuardianField, setGuardianRequiredDefault, updateGuardianField } from "@/lib/guardian-fields-server";
import { isPublicTextKey } from "@/lib/public-texts";
import { TICKET_TEXT_KEYS } from "@/lib/tickets";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess, pickEvent } from "../access";

async function scope(eventParam: unknown) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a;
  const { selected } = await pickEvent(a.organizationId, typeof eventParam === "string" ? eventParam : null);
  if (!selected) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { ...a, eventId: selected.id };
}

export async function GET(req: NextRequest) {
  const s = await scope(req.nextUrl.searchParams.get("event"));
  if ("error" in s) return s.error;
  return NextResponse.json(await formStructure(s.eventId));
}

export async function PATCH(req: NextRequest) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const s = await scope(b.event);
  if ("error" in s) return s.error;
  const log = (after: object) => prisma.fieldChangeLog.create({ data: { organizationId: s.organizationId, action: "form", byId: s.userId, before: {}, after: JSON.parse(JSON.stringify({ eventId: s.eventId, ...after })) } });
  try {
    if (b.reset === true) {
      await resetForm(s.eventId);
      await log({ reset: true });
    } else if (b.text && typeof b.text === "object") {
      const { scope: sc, key, value } = b.text as { scope?: unknown; key?: unknown; value?: unknown };
      const ok = typeof key === "string" && typeof value === "string" && ((sc === "public" && isPublicTextKey(key)) || (sc === "ticket" && (TICKET_TEXT_KEYS as readonly string[]).includes(key)));
      if (!ok) return NextResponse.json({ error: "invalid" }, { status: 400 });
      await setFormText(s.eventId, sc as "public" | "ticket", key as string, value as string);
      await log({ text: { key, value } });
    } else if (typeof b.key === "string" && typeof b.requiredDefault === "boolean") {
      const n = await setOrgRequired(s.organizationId, b.key, b.requiredDefault);
      await log({ key: b.key, requiredDefault: b.requiredDefault, eventsChanged: n });
    } else if (b.order && typeof b.order === "object") {
      const { place, keys } = b.order as { place?: unknown; keys?: unknown };
      if ((place !== "person" && place !== "questions") || !Array.isArray(keys) || !keys.every((k) => typeof k === "string") || keys.length > 200) return NextResponse.json({ error: "invalid" }, { status: 400 });
      await reorderQuestions(s.eventId, place, keys as string[]);
      await log({ order: { place, keys } });
    } else if (b.guardian && typeof b.guardian === "object") {
      const g = b.guardian as { key?: unknown; change?: unknown; requiredDefault?: unknown };
      if (typeof g.key !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
      if (typeof g.requiredDefault === "boolean") await setGuardianRequiredDefault(s.organizationId, g.key, g.requiredDefault);
      else if (g.change && typeof g.change === "object") await changeGuardianQuestion(s.eventId, g.key, g.change as Record<string, unknown>);
      else return NextResponse.json({ error: "invalid" }, { status: 400 });
      await log({ guardian: g });
    } else if (b.guardianField && typeof b.guardianField === "object") {
      const g = b.guardianField as Record<string, unknown>;
      if (g.action === "create") await createGuardianField(s.organizationId, { key: g.key, label: g.label, fieldType: g.fieldType, options: g.options, required: g.required, settings: g.settings });
      else if (g.action === "update" && typeof g.key === "string") await updateGuardianField(s.organizationId, g.key, g);
      else if (g.action === "delete" && typeof g.key === "string") await deleteGuardianField(s.organizationId, g.key);
      else return NextResponse.json({ error: "invalid" }, { status: 400 });
      await log({ guardianField: g });
    } else if (typeof b.key === "string" && b.change && typeof b.change === "object") {
      await changeQuestion(s.eventId, b.key, b.change as Record<string, unknown>);
      await log({ key: b.key, change: b.change });
    } else return NextResponse.json({ error: "invalid" }, { status: 400 });
  } catch (err) {
    const code = err instanceof Error && /^[a-z_]+$/.test(err.message) ? err.message : "failed";
    if (code === "failed") console.error("[fields/form]", err);
    return NextResponse.json({ error: code }, { status: 400 });
  }
  invalidateResolverContext(s.eventId);
  return NextResponse.json(await formStructure(s.eventId));
}
