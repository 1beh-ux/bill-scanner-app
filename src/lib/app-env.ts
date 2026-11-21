// Which deployment this is (docs/staging/plan.md). Production never sets APP_ENV, so
// everything gated on isStaging() is inert there.
export function isStaging(): boolean {
  return process.env.APP_ENV === "staging";
}

/**
 * Staging never mails a real recipient: every message goes to STAGING_MAIL_REDIRECT, or back to the
 * sending mailbox itself when that's unset; the intended recipient rides along in the subject.
 */
export function stagingMailRewrite<T extends { to: string; subject: string; senderEmail: string }>(opts: T): T {
  if (!isStaging()) return opts;
  const to = process.env.STAGING_MAIL_REDIRECT || opts.senderEmail;
  return { ...opts, to, subject: `[STAGING → ${opts.to}] ${opts.subject}` };
}
