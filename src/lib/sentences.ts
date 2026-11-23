// Redesign R10 (Q-R4, 2026-11-23): the "sentence" variables -- a whole sentence that is printed only when its value
// exists -- with the organization's own wording. Stored per organization (AppSetting "fm_sentences:<org>");
// `{value}` is the link / date. Without an own wording the sentence is today's. Only with the Fields Manager flag on.
import { prisma } from "@/lib/prisma";

export const SENTENCES = {
  questionnaire_line: { value: "questionnaire_url", text: "Odkaz na vyplnění dotazníku: {value}." },
  registration_deadline_line: { value: "registration_deadline", text: "Vyplněné a podepsané dokumenty nám prosím pošlete zpět nejpozději do {value}." },
  portal_link_line: { value: "portal_link", text: "Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: {value} (při prvním otevření se zeptá na datum narození)." },
  // Two versions: the family portal (a member) or this registration's own page.
  details_link_line_portal: { value: "details_link", text: "Údaje, dokumenty a platbu najdete v rodinném portálu: {value} (při prvním otevření se zeptá na datum narození)." },
  details_link_line_page: { value: "details_link", text: "Údaje, dokumenty a platbu k této přihlášce najdete na její osobní stránce: {value} (při otevření se zeptá na datum narození přihlášeného)." },
} as const;
export type SentenceKey = keyof typeof SENTENCES;
export const isSentenceKey = (k: string): k is SentenceKey => k in SENTENCES;

const settingKey = (organizationId: string) => `fm_sentences:${organizationId}`;

export async function loadSentences(eventId: string): Promise<Partial<Record<SentenceKey, string>>> {
  const e = await prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  return e ? orgSentences(e.organizationId) : {};
}
export async function orgSentences(organizationId: string): Promise<Partial<Record<SentenceKey, string>>> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKey(organizationId) } });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => isSentenceKey(k) && typeof x === "string")) as Partial<Record<SentenceKey, string>>;
}
export async function saveSentence(organizationId: string, key: SentenceKey, text: string | null) {
  const now = await orgSentences(organizationId);
  const next = { ...now };
  if (text && text.trim()) next[key] = text.trim().slice(0, 1000);
  else delete next[key];
  await prisma.appSetting.upsert({ where: { key: settingKey(organizationId) }, update: { value: next }, create: { key: settingKey(organizationId), value: next } });
}

/** What `{value}` is for each sentence, from the variables already built. Pure. */
export const sentenceValues = (text: Record<string, string>, _event?: unknown) => ({ ...text, __portal: text.portal_link ? "1" : "" });

/** The sentences with the organization's wording (empty value -> empty sentence, as today). Pure. */
export function applySentences(text: Record<string, string>, own: Partial<Record<SentenceKey, string>>, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const fill = (tpl: string, v: string) => (v ? tpl.split("{value}").join(v) : "");
  for (const k of ["questionnaire_line", "registration_deadline_line", "portal_link_line"] as const) if (own[k] !== undefined && k in text) out[k] = fill(own[k]!, values[SENTENCES[k].value] ?? "");
  const variant = values.__portal ? "details_link_line_portal" : "details_link_line_page";
  if (own[variant] !== undefined && "details_link_line" in text) out.details_link_line = fill(own[variant]!, values.details_link ?? "");
  return out;
}
