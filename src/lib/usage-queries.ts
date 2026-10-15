// /vyuziti (super-admin): usage + cost aggregation, all grouped in SQL. Counts cast to int /
// float8 so rows come back as plain numbers. Organization of AI cost and storage = the event's.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type UsageFilter = { since: Date; orgId: string | null; eventId: string | null; withSuper: boolean };

const DAY = 864e5;
export const sinceDays = (days: number) => (days > 0 ? new Date(Date.now() - days * DAY) : new Date(0));
const ago7 = () => new Date(Date.now() - 7 * DAY);
const ago12m = () => new Date(Date.now() - 365 * DAY);

// Page views of the filter, joined to their user (u) -- super-admins left out unless asked.
function activityWhere(f: UsageFilter, from: Date) {
  return Prisma.sql`a.created_at >= ${from}
    AND (${f.withSuper} OR NOT u.is_super_admin)
    ${f.orgId ? Prisma.sql`AND a.organization_id = ${f.orgId}` : Prisma.empty}
    ${f.eventId ? Prisma.sql`AND a.event_id = ${f.eventId}` : Prisma.empty}`;
}

// Actions = bill edits/approvals (bill_audit_log) + mail actions + parent e-mails, with their event's organization.
function actionsCte(f: UsageFilter) {
  return Prisma.sql`acts AS (
    SELECT l.user_id, e.organization_id AS org_id, e.id AS event_id FROM bill_audit_log l JOIN bills b ON b.id = l.bill_id JOIN events e ON e.id = b.event_id WHERE l.changed_at >= ${f.since}
    UNION ALL SELECT m.user_id, e.organization_id, e.id FROM mail_action_logs m JOIN events e ON e.id = m.event_id WHERE m.created_at >= ${f.since}
    UNION ALL SELECT p.sent_by_user_id, e.organization_id, e.id FROM parent_email_log p JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = pa.event_id WHERE p.sent_at >= ${f.since}
  ), facts AS (
    SELECT acts.* FROM acts JOIN users u ON u.id = acts.user_id
    WHERE (${f.withSuper} OR NOT u.is_super_admin)
      ${f.orgId ? Prisma.sql`AND acts.org_id = ${f.orgId}` : Prisma.empty}
      ${f.eventId ? Prisma.sql`AND acts.event_id = ${f.eventId}` : Prisma.empty}
  )`;
}

export async function activityOverview(f: UsageFilter) {
  const from = f.since < ago7() ? f.since : ago7();
  const [orgs, users, pages] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; active7: number; activeP: number; viewsP: number; actionsP: number; last: Date | null }[]>`
      WITH ${actionsCte({ ...f, orgId: null, eventId: null })},
      v AS (SELECT a.organization_id, a.user_id, a.created_at FROM user_activity a JOIN users u ON u.id = a.user_id WHERE ${activityWhere({ ...f, orgId: null, eventId: null }, from)})
      SELECT o.id, o.name,
        (SELECT COUNT(DISTINCT user_id) FROM v WHERE v.organization_id = o.id AND v.created_at >= ${ago7()})::int AS active7,
        (SELECT COUNT(DISTINCT user_id) FROM v WHERE v.organization_id = o.id AND v.created_at >= ${f.since})::int AS "activeP",
        (SELECT COUNT(*) FROM v WHERE v.organization_id = o.id AND v.created_at >= ${f.since})::int AS "viewsP",
        (SELECT COUNT(*) FROM facts WHERE facts.org_id = o.id)::int AS "actionsP",
        (SELECT MAX(created_at) FROM user_activity WHERE organization_id = o.id) AS last
      FROM organizations o ORDER BY o.name`,
    prisma.$queryRaw<{ id: string; name: string; email: string; org: string; isSuperAdmin: boolean; last: Date | null; views7: number; viewsP: number; actionsP: number; topModule: string | null }[]>`
      WITH ${actionsCte(f)},
      v AS (SELECT a.user_id, a.created_at, a.module FROM user_activity a JOIN users u ON u.id = a.user_id WHERE ${activityWhere(f, from)})
      SELECT u.id, u."displayName" AS name, u.email, o.name AS org, u.is_super_admin AS "isSuperAdmin",
        (SELECT MAX(created_at) FROM user_activity WHERE user_id = u.id) AS last,
        (SELECT COUNT(*) FROM v WHERE v.user_id = u.id AND v.created_at >= ${ago7()})::int AS views7,
        (SELECT COUNT(*) FROM v WHERE v.user_id = u.id AND v.created_at >= ${f.since})::int AS "viewsP",
        (SELECT COUNT(*) FROM facts WHERE facts.user_id = u.id)::int AS "actionsP",
        (SELECT mode() WITHIN GROUP (ORDER BY module) FROM v WHERE v.user_id = u.id AND v.created_at >= ${f.since}) AS "topModule"
      FROM users u JOIN organizations o ON o.id = u.organization_id
      WHERE (${f.withSuper} OR NOT u.is_super_admin)
        ${f.orgId ? Prisma.sql`AND (u.organization_id = ${f.orgId} OR EXISTS (SELECT 1 FROM v WHERE v.user_id = u.id))` : Prisma.empty}
        ${f.eventId ? Prisma.sql`AND EXISTS (SELECT 1 FROM v WHERE v.user_id = u.id)` : Prisma.empty}
      ORDER BY last DESC NULLS LAST, u."displayName"`,
    prisma.$queryRaw<{ route: string; views: number; users: number }[]>`
      SELECT a.route, COUNT(*)::int AS views, COUNT(DISTINCT a.user_id)::int AS users
      FROM user_activity a JOIN users u ON u.id = a.user_id WHERE ${activityWhere(f, f.since)}
      GROUP BY a.route ORDER BY views DESC LIMIT 100`,
  ]);
  return { orgs, users, pages };
}

export async function activityOfUser(userId: string, f: UsageFilter) {
  const [daily, routes, events] = await Promise.all([
    prisma.$queryRaw<{ day: string; views: number }[]>`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
      FROM user_activity WHERE user_id = ${userId} AND created_at >= ${new Date(Date.now() - 90 * DAY)} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ route: string; views: number }[]>`
      SELECT route, COUNT(*)::int AS views FROM user_activity WHERE user_id = ${userId} AND created_at >= ${f.since}
      GROUP BY route ORDER BY views DESC LIMIT 15`,
    prisma.$queryRaw<{ id: string; name: string; org: string; views: number; last: Date }[]>`
      SELECT e.id, e.name, o.name AS org, COUNT(*)::int AS views, MAX(a.created_at) AS last
      FROM user_activity a JOIN events e ON e.id = a.event_id JOIN organizations o ON o.id = e.organization_id
      WHERE a.user_id = ${userId} AND a.created_at >= ${f.since} GROUP BY e.id, e.name, o.name ORDER BY last DESC`,
  ]);
  return { daily, routes, events };
}

// Every stored GCS object once (the same PDF / photo can sit on several rows), with its event,
// organization, kind and uploader. Person documents belong to the organization, not an event.
const STORAGE_CTE = Prisma.sql`f AS (
    SELECT b.gcs_object_path AS path, b.size_bytes AS size, e.id AS event_id, e.organization_id AS org_id, 'bills' AS kind, b.created_by_user_id AS uploader FROM bills b JOIN events e ON e.id = b.event_id
    UNION ALL SELECT i.photo_gcs_path, i.size_bytes, e.id, e.organization_id, 'incident_photos', i.created_by_user_id FROM incidents i JOIN participants pa ON pa.id = i.participant_id JOIN events e ON e.id = pa.event_id WHERE i.photo_gcs_path IS NOT NULL
    UNION ALL SELECT iu.photo_gcs_path, iu.size_bytes, e.id, e.organization_id, 'incident_photos', iu.updated_by_user_id FROM incident_updates iu JOIN incidents i ON i.id = iu.incident_id JOIN participants pa ON pa.id = i.participant_id JOIN events e ON e.id = pa.event_id WHERE iu.photo_gcs_path IS NOT NULL
    UNION ALL SELECT l.pdf_gcs_path, l.size_bytes, e.id, e.organization_id, 'parent_summaries', l.sent_by_user_id FROM parent_email_log l JOIN participants pa ON pa.id = l.participant_id JOIN events e ON e.id = pa.event_id WHERE l.pdf_gcs_path IS NOT NULL
    UNION ALL SELECT d.gcs_path, d.size_bytes, e.id, e.organization_id, 'participant_documents', d.received_by_user_id FROM participant_documents d JOIN participants pa ON pa.id = d.participant_id JOIN events e ON e.id = pa.event_id WHERE d.gcs_path IS NOT NULL
    UNION ALL SELECT pd.gcs_path, pd.size_bytes, NULL, c.organization_id, 'person_documents', pd.created_by_user_id FROM person_documents pd JOIN children c ON c.id = pd.child_id
  ), s AS (SELECT DISTINCT ON (path) * FROM f ORDER BY path, size DESC NULLS LAST)`;

type StorageRow = { key: string | null; bytes: number; files: number; unmeasured: number };
function storageBy(group: "org_id" | "event_id" | "kind" | "uploader", where: Prisma.Sql = Prisma.empty) {
  return prisma.$queryRaw<StorageRow[]>`
    WITH ${STORAGE_CTE}
    SELECT ${Prisma.raw(group)} AS key, COALESCE(SUM(size), 0)::float8 AS bytes, COUNT(*)::int AS files, COUNT(*) FILTER (WHERE size IS NULL)::int AS unmeasured
    FROM s WHERE TRUE ${where} GROUP BY ${Prisma.raw(group)}`;
}

type AiRow = { id: string; name: string; events?: number; aiCost: number; aiCalls: number; bills: number; unpriced: number };
const AI_COLS = Prisma.sql`COALESCE(SUM(x.cost_usd), 0)::float8 AS "aiCost", COUNT(x.id)::int AS "aiCalls",
  COUNT(DISTINCT x.bill_id) FILTER (WHERE x.success)::int AS bills, COUNT(x.id) FILTER (WHERE x.cost_usd IS NULL)::int AS unpriced`;

export async function costOrgs(since: Date) {
  const [ai, storage] = await Promise.all([
    prisma.$queryRaw<AiRow[]>`
      SELECT o.id, o.name, COUNT(DISTINCT e.id)::int AS events, ${AI_COLS}
      FROM organizations o LEFT JOIN events e ON e.organization_id = o.id LEFT JOIN ai_usage x ON x.event_id = e.id AND x.created_at >= ${since}
      GROUP BY o.id, o.name ORDER BY o.name`,
    storageBy("org_id"),
  ]);
  return { ai, storage };
}

export async function costOrg(orgId: string, since: Date) {
  const [org, ai, storage, monthly] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } }),
    prisma.$queryRaw<AiRow[]>`
      SELECT e.id, e.name, ${AI_COLS}
      FROM events e LEFT JOIN ai_usage x ON x.event_id = e.id AND x.created_at >= ${since}
      WHERE e.organization_id = ${orgId} GROUP BY e.id, e.name ORDER BY "aiCost" DESC, e.name`,
    storageBy("event_id", Prisma.sql`AND org_id = ${orgId}`),
    monthlyAi(Prisma.sql`e.organization_id = ${orgId}`),
  ]);
  return { org, ai, storage, monthly };
}

function monthlyAi(where: Prisma.Sql) {
  return prisma.$queryRaw<{ month: string; cost: number; calls: number }[]>`
    SELECT to_char(date_trunc('month', x.created_at), 'YYYY-MM') AS month, COALESCE(SUM(x.cost_usd), 0)::float8 AS cost, COUNT(*)::int AS calls
    FROM ai_usage x JOIN events e ON e.id = x.event_id WHERE ${where} AND x.created_at >= ${ago12m()} GROUP BY 1 ORDER BY 1`;
}

export async function costEvent(eventId: string, since: Date) {
  const w = Prisma.sql`x.event_id = ${eventId} AND x.created_at >= ${since}`;
  const [event, totals, byUser, byPurpose, topBills, monthly, storageKind, storageUser] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, organization: { select: { id: true, name: true } } } }),
    prisma.$queryRaw<{ aiCost: number; aiCalls: number; bills: number; unpriced: number; reprocess: number; failed: number }[]>`
      SELECT ${AI_COLS}, COUNT(*) FILTER (WHERE x.purpose = 'bill_reprocess')::int AS reprocess, COUNT(*) FILTER (WHERE NOT x.success)::int AS failed
      FROM ai_usage x WHERE ${w}`,
    prisma.$queryRaw<{ userId: string | null; name: string | null; cost: number; calls: number }[]>`
      SELECT x.user_id AS "userId", u."displayName" AS name, COALESCE(SUM(x.cost_usd), 0)::float8 AS cost, COUNT(*)::int AS calls
      FROM ai_usage x LEFT JOIN users u ON u.id = x.user_id WHERE ${w} GROUP BY x.user_id, u."displayName" ORDER BY cost DESC`,
    prisma.$queryRaw<{ purpose: string; cost: number; calls: number }[]>`
      SELECT x.purpose, COALESCE(SUM(x.cost_usd), 0)::float8 AS cost, COUNT(*)::int AS calls FROM ai_usage x WHERE ${w} GROUP BY x.purpose ORDER BY cost DESC`,
    prisma.$queryRaw<{ billId: string; exists: boolean; label: string | null; cost: number; calls: number }[]>`
      SELECT x.bill_id AS "billId", (b.id IS NOT NULL) AS exists, COALESCE(b.merchant_name, b.original_filename) AS label,
        COALESCE(SUM(x.cost_usd), 0)::float8 AS cost, COUNT(*)::int AS calls
      FROM ai_usage x LEFT JOIN bills b ON b.id = x.bill_id WHERE ${w} AND x.bill_id IS NOT NULL
      GROUP BY x.bill_id, b.id, b.merchant_name, b.original_filename ORDER BY cost DESC, calls DESC LIMIT 10`,
    monthlyAi(Prisma.sql`x.event_id = ${eventId}`),
    storageBy("kind", Prisma.sql`AND event_id = ${eventId}`),
    prisma.$queryRaw<(StorageRow & { name: string | null })[]>`
      WITH ${STORAGE_CTE}
      SELECT s.uploader AS key, u."displayName" AS name, COALESCE(SUM(s.size), 0)::float8 AS bytes, COUNT(*)::int AS files, COUNT(*) FILTER (WHERE s.size IS NULL)::int AS unmeasured
      FROM s LEFT JOIN users u ON u.id = s.uploader WHERE s.event_id = ${eventId} GROUP BY s.uploader, u."displayName" ORDER BY bytes DESC`,
  ]);
  return { event, totals: totals[0], byUser, byPurpose, topBills, monthly, storageKind, storageUser };
}

/** Models seen in AiUsage (for the price form). */
export const usedModels = () => prisma.aiUsage.findMany({ distinct: ["model"], select: { model: true } }).then((r) => r.map((x) => x.model));
