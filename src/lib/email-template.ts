import { prisma } from "@/lib/prisma";

export const PARENT_SUMMARY_PURPOSE_KEY = "parent_health_summary";

export const DEFAULT_EMAIL_SUBJECT = "Souhrn zdravotních záznamů – {{child_name}} – {{camp_name}}";
export const DEFAULT_EMAIL_BODY = `Dobrý den,

v příloze zasíláme souhrn zdravotních záznamů pro {{child_name}} z akce {{camp_name}} ({{date_range}}).

S pozdravem,
{{sender_name}}`;

/** The single org-default row for this purpose, created on first read if missing. */
export async function getOrCreateOrgEmailTemplate() {
  return prisma.emailTemplate.upsert({
    where: { purposeKey: PARENT_SUMMARY_PURPOSE_KEY },
    update: {},
    create: {
      purposeKey: PARENT_SUMMARY_PURPOSE_KEY,
      subject: DEFAULT_EMAIL_SUBJECT,
      body: DEFAULT_EMAIL_BODY,
    },
  });
}

/** Event override if one exists, otherwise the org default -- used at send time. */
export async function resolveEmailTemplate(eventId: string): Promise<{ subject: string; body: string }> {
  const override = await prisma.eventEmailTemplate.findUnique({
    where: { eventId_purposeKey: { eventId, purposeKey: PARENT_SUMMARY_PURPOSE_KEY } },
  });
  if (override) return { subject: override.subject, body: override.body };

  const org = await getOrCreateOrgEmailTemplate();
  return { subject: org.subject, body: org.body };
}

export function substituteVariables(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}
