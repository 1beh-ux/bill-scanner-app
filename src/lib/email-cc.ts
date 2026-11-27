// A copy of the participant e-mails for e.g. the group leader (2026-11-27): Event.ccRule picks a field (Oddíl or any
// other select field) and gives each option its e-mail address(es); Event.emailCc says per template what goes to
// them -- "copy" (the same e-mail, attachments included) or "notice" (a short notification, own editable text).
// Pure.
export type CcRule = { fieldKey: string; map: Record<string, string>; noticeSubject: string; noticeBody: string };
export type CcMode = "copy" | "notice";

export const DEFAULT_NOTICE_SUBJECT = "{{participant_name}}: {{original_subject}}";
export const DEFAULT_NOTICE_BODY =
  "Dobrý den,\n\n{{participant_name}} ({{camp_name}}) právě dostal(a) e-mail „{{original_subject}}“.\n\nTato zpráva vám přišla jako kopie podle nastavení akce.";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function readCcRule(raw: unknown): CcRule | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (typeof o.fieldKey !== "string" || !o.fieldKey.trim()) return null;
  const map = Object.fromEntries(
    Object.entries((o.map && typeof o.map === "object" ? o.map : {}) as Record<string, unknown>)
      .filter(([k, v]) => k.trim() && typeof v === "string" && v.trim())
      .map(([k, v]) => [k, (v as string).trim().slice(0, 500)]),
  );
  const text = (v: unknown, d: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
  return { fieldKey: o.fieldKey.trim(), map, noticeSubject: text(o.noticeSubject, DEFAULT_NOTICE_SUBJECT, 300), noticeBody: text(o.noticeBody, DEFAULT_NOTICE_BODY, 5000) };
}

export function readEmailCc(raw: unknown): Record<string, CcMode> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v === "copy" || v === "notice")) as Record<string, CcMode>;
}

/** The addresses for a participant: the option of their value (several separated by , ; or spaces), valid only. */
export function ccAddresses(rule: CcRule | null, values: Record<string, string | undefined>): string[] {
  if (!rule) return [];
  const v = values[rule.fieldKey]?.trim();
  const raw = v ? rule.map[v] : undefined;
  return raw ? [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => EMAIL.test(x)))] : [];
}
