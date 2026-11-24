// Pole -> Formulář (rethink 2026-11-24): the event's form as the applicant sees it, and its changes.
//   GET   ?event=                                         -> FormStructure
//   PATCH {event, key, change: {ask, required, audience, when, label, hint}}   -> one question
//   PATCH {event, text: {scope, key, value}}              -> wording of one of the form's own texts (this event)
//   PATCH {event, reset: true}                            -> back to today's rules (portal-derived) for the event
// Admins of a flagged organization only; every change logged.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeQuestion, formStructure, resetForm, setFormText } from "@/lib/form-structure";
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
