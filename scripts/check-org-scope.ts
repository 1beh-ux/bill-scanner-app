// Organizations step 2: every API route and server page must stay inside one
// organization (docs/organizations-change-notes.md). Flags any that touches an
// org-owned table or receives an event id without one of the guards
// (src/lib/org-scope.ts, src/lib/module-access.ts, or a wrapper of them).
// npx tsx scripts/check-org-scope.ts   -- exit 1 on any unexplained hit.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ORG_TABLES = /prisma\.(user|event|author|child|family|driveAccount|mailSenderAccount|publicHost|merchantAlias|categoryTemplate|listTemplate|emailTemplate|participantFieldTemplate|personDocument|childGuardian)\./;
const EVENT_ID = /\/events\/\[id\]\/|\beventId\b/;
const GUARDS =
  /\b(requireModuleAccess|requireAnyModuleAccess|requireListItemAccess|hasModuleAccess|requireEventInOrg|eventInOrg|requireOrgAdminEvent|getActingOrgId|orgWhere|requireSuperAdmin|authorInOrg|childInOrg|authorizePlanning|portalScope|resolvePublicHost|moveBillToEvent|orgIdOfUser|templateScope)\b/;

// Genuinely global (or guarded by something other than a login) -- with the reason.
const ALLOW: Record<string, string> = {
  "src/app/api/session/route.ts": "login itself: looks the user up by the verified Google e-mail",
  "src/app/api/me/route.ts": "the signed-in user's own row only",
  "src/app/api/me/google-account/route.ts": "the signed-in user's own Google connection and the events it runs",
  "src/app/api/config/drive-account/route.ts": "the service account address, the same for everyone",
  "src/app/api/translations/route.ts": "app-wide texts (GET for every user, writes super-admin only)",
  "src/app/api/exchange-rates/lookup/route.ts": "ČNB rates, app-wide",
  "src/app/api/cron/exchange-rates/route.ts": "cron (CRON_SECRET): app-wide ČNB rates",
  "src/app/api/cron/mail-drive-sync/route.ts": "cron (CRON_SECRET): one event at a time, that event's own data",
  "src/app/api/cron/mail-sheets-sync/route.ts": "cron (CRON_SECRET): one event at a time, that event's own data",
  "src/app/api/cron/participant-sync/route.ts": "cron (CRON_SECRET): one event at a time; linking via the org-safe linkChildren",
  "src/app/api/cron/requeue-stuck-bills/route.ts": "cron (CRON_SECRET): re-queues stuck bills, no cross-event data",
  "src/app/api/tasks/process-bill-ai/[id]/route.ts": "Cloud Tasks (TASKS_SECRET): one bill; merchant aliases per its event's organization",
  "src/app/api/mail-oauth/authorize/route.ts": "starts Google OAuth for an event the user has module access to (checked again in the callback)",
  "src/app/(public)/not-found.tsx": "public 404 page: translations only",
  "src/app/(public)/public-landing/page.tsx": "public landing page: translations only",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts" || ((name === "page.tsx" || name === "not-found.tsx" || name === "layout.tsx") && /prisma|"use server"/.test(readFileSync(p, "utf8")))) out.push(p);
  }
  return out;
}

const files = walk("src/app").sort();
let hits = 0;
let allowed = 0;
for (const f of files) {
  const s = readFileSync(f, "utf8");
  const needs = ORG_TABLES.test(s) || EVENT_ID.test(f) || EVENT_ID.test(s);
  if (!needs || GUARDS.test(s)) continue;
  if (ALLOW[f]) {
    allowed++;
    console.log(`allow  ${f}  -- ${ALLOW[f]}`);
    continue;
  }
  hits++;
  console.log(`FLAG   ${f}`);
}
const stale = Object.keys(ALLOW).filter((f) => !files.includes(f));
for (const f of stale) console.log(`STALE  allow-list entry for a missing file: ${f}`);
console.log(`\n${files.length} files checked, ${allowed} allow-listed, ${hits} unexplained${stale.length ? `, ${stale.length} stale allow-list entries` : ""}`);
process.exit(hits || stale.length ? 1 : 0);
