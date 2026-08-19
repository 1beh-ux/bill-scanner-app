export const TEMPLATE_VARIABLES = ["child_name", "camp_name", "date_range", "sender_name"] as const;

export const TEMPLATE_DUMMY_VALUES: Record<(typeof TEMPLATE_VARIABLES)[number], string> = {
  child_name: "Anna Nováková",
  camp_name: "Letní tábor 2026",
  date_range: "1.–7. 8. 2026",
  sender_name: "Zdravotník",
};

export function substituteDummyTemplateValues(text: string): string {
  let out = text;
  for (const key of TEMPLATE_VARIABLES) {
    out = out.replaceAll(`{{${key}}}`, TEMPLATE_DUMMY_VALUES[key]);
  }
  return out;
}
