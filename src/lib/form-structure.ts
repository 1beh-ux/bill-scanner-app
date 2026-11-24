// Pole -> Formulář (rethink 2026-11-24): an event's registration form as the applicant sees it, top to bottom and in
// the same words -- the app's own questions (person, price, guardians, note) with their texts (the event's own over
// the organization's over the default), and the questions from fields with their settings (form-config.ts).
// Ticket events: the ticket form (buyer, tickets, the event's questions, note).
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { readPublicTexts, withPublicTexts } from "@/lib/public-texts";
import { readPriceRules } from "@/lib/price-rules";
import { readTicketSettings } from "@/lib/tickets";
import { applyFormChange, effectiveFormConfig, readFormConfig, type FormConfig } from "@/lib/form-config";

export type FormRow =
  | { kind: "text"; id: string; label: string; textKey: string; scope: "public" | "ticket"; note?: string; required?: boolean }
  | { kind: "info"; id: string; label: string; note?: string; href?: string }
  | { kind: "question"; id: string; key: string; name: string; label: string; origin: "org" | "event" | "calculated"; fieldType: string; cfg: FormConfig; inPortal: string | null; profile: boolean };
export type FormSection = { id: string; title: string; rows: FormRow[] };
export type FormStructure = {
  event: { id: string; name: string; kind: string; slug: string | null; publicRegistration: boolean; detailsAfterAcceptance: boolean };
  converted: boolean;
  sections: FormSection[];
  other: Extract<FormRow, { kind: "question" }>[];
};

const SYSTEM_KEYS = ["public.firstName", "public.lastName", "portal.reviewBirth", "public.addChild", "public.addAdult", "portal.guardianEmail", "portal.guardianPhone", "portal.guardianName", "portal.guardianRelationship", "portal.guardians", "portal.note"];
const TICKET_KEYS = ["name", "email", "phone", "note", "ticketsTitle"];

export async function formStructure(eventId: string): Promise<FormStructure> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { organization: { select: { publicTexts: true } } } });
  const [fields, templates] = await Promise.all([
    prisma.eventParticipantField.findMany({ where: { eventId, kind: "custom" }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.participantFieldTemplate.findMany({ where: { organizationId: event.organizationId, active: true }, orderBy: [{ portalSortOrder: { sort: "asc", nulls: "last" } }, { label: "asc" }] }),
  ]);
  const tpl = new Map(templates.map((t) => [t.key, t]));
  const ticket = event.kind === "public_event";
  const base = { id: event.id, name: event.name, kind: event.kind, slug: event.publicSlug, publicRegistration: event.publicRegistration, detailsAfterAcceptance: event.detailsAfterAcceptance };

  const question = (f: (typeof fields)[number] | null, key: string): Extract<FormRow, { kind: "question" }> => {
    const t = tpl.get(key);
    const cfg = ticket
      ? { ask: !!f?.active, required: !!f?.requiredOnRegistration, audience: null, when: "registration" as const, label: null, hint: null }
      : f
        ? effectiveFormConfig(f, t, event.detailsAfterAcceptance)
        : { ask: false, required: false, audience: null, when: "registration" as const, label: null, hint: null };
    const name = f?.label ?? t?.label ?? key;
    const fieldType = t?.fieldType ?? f?.fieldType ?? "text";
    return { kind: "question", id: `q:${key}`, key, name, label: cfg.label ?? name, origin: fieldType === "calculated" ? "calculated" : t ? "org" : "event", fieldType, cfg, inPortal: t && t.portalAccess !== "hidden" ? t.portalAccess : null, profile: !!t && t.storage !== "event" };
  };
  const all = [...fields.filter((f) => f.active || !ticket).map((f) => question(f.active ? f : { ...f, formConfig: { ...((readFormConfig(f.formConfig) ?? {}) as object), ask: false } }, f.key)), ...(ticket ? [] : templates.filter((t) => !fields.some((f) => f.key === t.key)).map((t) => question(null, t.key)))];
  const asked = all.filter((q) => q.cfg.ask);
  const other = all.filter((q) => !q.cfg.ask);

  if (ticket) {
    const s = readTicketSettings(event.ticketSettings, event.startDate);
    const rows = await prisma.translation.findMany({ where: { key: { in: TICKET_KEYS.map((k) => `ticketForm.${k}`) } }, select: { key: true, cs: true } });
    const text = (k: string) => s.texts[k] ?? rows.find((r) => r.key === `ticketForm.${k}`)?.cs ?? k;
    const t = (k: string, required?: boolean): FormRow => ({ kind: "text", id: `t:${k}`, label: text(k), textKey: k, scope: "ticket", required });
    return {
      event: base,
      converted: false,
      sections: [
        { id: "buyer", title: "Kupující", rows: [t("name", true), t("email", true), t("phone")] },
        { id: "tickets", title: "Vstupenky", rows: [{ kind: "info", id: "i:tickets", label: text("ticketsTitle"), note: "druhy a ceny vstupenek", href: `/events/${eventId}?tab=vstupenky` }] },
        { id: "questions", title: "Otázky", rows: asked },
        { id: "end", title: "Na konec", rows: [t("note")] },
      ],
      other,
    };
  }

  const rows = await prisma.translation.findMany({ where: { key: { in: SYSTEM_KEYS } }, select: { key: true, cs: true } });
  const strings = withPublicTexts(Object.fromEntries(rows.map((r) => [r.key, r.cs])), event.organization.publicTexts, event.publicTexts);
  const t = (k: string, required?: boolean, note?: string): FormRow => ({ kind: "text", id: `t:${k}:${note ?? ""}`, label: strings[k] ?? k, textKey: k, scope: "public", required, note });
  const rules = readPriceRules(event.priceRules);
  return {
    event: base,
    converted: fields.some((f) => f.formConfig !== null),
    sections: [
      { id: "person", title: "Osoba", rows: [
        { kind: "info", id: "i:who", label: `${strings["public.addChild"] ?? "Přidat dítě"} / ${strings["public.addAdult"] ?? "Přidat dospělého"}`, note: "dítě nebo dospělý – určuje, které otázky se ukážou" },
        t("public.firstName", true), t("public.lastName", true), t("portal.reviewBirth", true),
        t("portal.guardianEmail", true, "jen dospělý"), t("portal.guardianPhone", false, "jen dospělý"),
      ] },
      ...(rules?.categories.length ? [{ id: "price", title: "Cena", rows: [{ kind: "info" as const, id: "i:cat", label: rules.categories.map((c) => c.label).join(" · "), note: "kategorie z cenových pravidel", href: `/events/${eventId}?tab=platba` }] }] : []),
      { id: "questions", title: "Otázky", rows: asked },
      { id: "guardians", title: strings["portal.guardians"] ?? "Zákonní zástupci", rows: [t("portal.guardianName", true, "u dětí"), t("portal.guardianEmail", true, "u dětí"), t("portal.guardianPhone", false, "u dětí"), t("portal.guardianRelationship", false, "u dětí")] },
      { id: "end", title: "Na konec", rows: [t("portal.note")] },
    ],
    other,
  };
}

/**
 * One question changed. The first change converts the event: every field gets the settings that reproduce what its
 * form asked so far, so nothing else moves. A field of the organization not yet in the event is taken in.
 */
export async function changeQuestion(eventId: string, key: string, change: Record<string, unknown>) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, kind: true, organizationId: true, detailsAfterAcceptance: true } });
  return prisma.$transaction(async (tx) => {
    let f = await tx.eventParticipantField.findFirst({ where: { eventId, key } });
    const t = await tx.participantFieldTemplate.findFirst({ where: { organizationId: event.organizationId, key, active: true } });
    if (!f && !t) throw new Error("not_found");
    if (f && f.kind !== "custom") throw new Error("fixed_field");
    if (event.kind === "public_event") {
      // Ticket events: asked = active, required = Vyžadovat (ticket-fields.ts); wording = the field's name.
      if (!f) throw new Error("not_found");
      await tx.eventParticipantField.update({ where: { id: f.id }, data: { ...(typeof change.ask === "boolean" && { active: change.ask }), ...(typeof change.required === "boolean" && { requiredOnRegistration: change.required }), ...(typeof change.label === "string" && change.label.trim() && { label: change.label.trim().slice(0, 200) }) } });
      return;
    }
    if (!f)
      f = await tx.eventParticipantField.create({ data: { eventId, key, label: t!.label, fieldType: t!.fieldType, options: (t!.options ?? undefined) as Prisma.InputJsonValue | undefined, surfaces: t!.defaultSurfaces, isFromTemplate: true } });
    const all = await tx.eventParticipantField.findMany({ where: { eventId, kind: "custom" } });
    const tpls = new Map((await tx.participantFieldTemplate.findMany({ where: { organizationId: event.organizationId, active: true } })).map((x) => [x.key, x]));
    for (const x of all.filter((x) => x.formConfig === null && x.id !== f!.id)) {
      const cfg = effectiveFormConfig(x, tpls.get(x.key), event.detailsAfterAcceptance);
      await tx.eventParticipantField.update({ where: { id: x.id }, data: { formConfig: cfg as unknown as Prisma.InputJsonValue } });
    }
    const now = effectiveFormConfig(f, tpls.get(key), event.detailsAfterAcceptance);
    const next = applyFormChange(now, change);
    // A question asked here is part of the event (switched on); "Vyžadovat" mirrors "asked" for older screens.
    await tx.eventParticipantField.update({ where: { id: f.id }, data: { formConfig: next as unknown as Prisma.InputJsonValue, requiredOnRegistration: next.ask, ...(next.ask && { active: true }) } });
  });
}

/** Back to today's rules for the whole event (the form asks what the portal settings say). */
export const resetForm = (eventId: string) => prisma.eventParticipantField.updateMany({ where: { eventId }, data: { formConfig: Prisma.DbNull } });

/** The wording of one of the form's own texts, for this event only (empty = back to the default). */
export async function setFormText(eventId: string, scope: "public" | "ticket", key: string, value: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { publicTexts: true, ticketSettings: true, startDate: true } });
  if (scope === "public") {
    const texts = { ...readPublicTexts(event.publicTexts) };
    if (value.trim()) texts[key] = value.trim();
    else delete texts[key];
    await prisma.event.update({ where: { id: eventId }, data: { publicTexts: texts } });
    return;
  }
  const settings = readTicketSettings(event.ticketSettings, event.startDate);
  const texts = { ...settings.texts };
  if (value.trim()) texts[key] = value.trim().slice(0, 1000);
  else delete texts[key];
  await prisma.event.update({ where: { id: eventId }, data: { ticketSettings: { ...((event.ticketSettings as object | null) ?? {}), texts } as Prisma.InputJsonValue } });
}
