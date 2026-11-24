// Redesign R9 (Q-R2/Q-R3, 2026-11-23): the participant's contact e-mail ({{Email}}) as a rule the admin sets per
// event in the Fields Manager. Without a saved rule the value is today's (first guardian receiving mail). Pure.
//   adults (18+ at the event): their own e-mail first -- a field of type e-mail ("auto" = the first one) -- else
//   the guardians; children: the guardians. Works for events without the people database too (the participant's
//   own guardians and values).
export type ContactRule = { adultSelfField: string | null; guardians: "first_receiving" | "all_receiving" | "first" };
export const RECOMMENDED_RULE: ContactRule = { adultSelfField: "auto", guardians: "first_receiving" };

export function readContactRule(v: unknown): ContactRule {
  const o = (v ?? {}) as Record<string, unknown>;
  const self = typeof o.adultSelfField === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,59}$|^auto$/.test(o.adultSelfField) ? o.adultSelfField : null;
  const g = o.guardians === "all_receiving" || o.guardians === "first" ? o.guardians : "first_receiving";
  return { adultSelfField: self, guardians: g };
}

type Guardian = { email: string; receivesCommunications: boolean };
export function contactEmail(rule: ContactRule, p: { guardians: Guardian[]; customFieldValues: Record<string, string> | null }, adult: boolean, emailFieldKeys: string[]): string {
  if (adult && rule.adultSelfField) {
    const key = rule.adultSelfField === "auto" ? emailFieldKeys.find((k) => p.customFieldValues?.[k]?.trim()) : rule.adultSelfField;
    const own = key ? p.customFieldValues?.[key]?.trim() : "";
    if (own) return own;
  }
  const receiving = p.guardians.filter((g) => g.receivesCommunications && g.email);
  if (rule.guardians === "all_receiving") return [...new Set(receiving.map((g) => g.email))].join(", ") || p.guardians[0]?.email || "";
  // Guardian 1, else 2, ... -- the first one with an e-mail.
  if (rule.guardians === "first") return p.guardians.find((g) => g.email)?.email ?? "";
  return receiving[0]?.email ?? p.guardians[0]?.email ?? "";
}
