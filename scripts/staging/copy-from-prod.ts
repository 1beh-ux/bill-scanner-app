// Copy PRODUCTION -> STAGING (approved by the owner 2026-11-23), without one excluded event and everything tied to it.
//   bash scripts/staging/run-staging-db.sh bash -c 'STAGING_URL="$DATABASE_URL" bash ~/claude-helpers/run-db.sh npx tsx scripts/staging/copy-from-prod.ts <mode>'
//   mode: dry (counts only, nothing written) | run
// Production is only read: one READ ONLY, REPEATABLE READ transaction. Rows of the excluded event (and every row that
// references them, directly or through other excluded rows) are filtered out while reading -- they never leave
// production. Credentials are never copied (tokens emptied, link codes regenerated); logs are skipped; staging keeps
// its own marker, translations and migration history. Prints table names and counts only.
import { Client } from "pg";

const EXCLUDE_EVENT_NAME = "Podzimní prázdniny 2026";
// public_hosts: production's own web addresses -- staging would send visitors to the production site.
const SKIP = new Set(["_prisma_migrations", "app_settings", "translations", "user_activity", "ai_usage", "portal_rate_hits", "public_hosts"]);
// Rows with these credentials can't be kept without them (NOT NULL token): left out, references to them nulled.
const DROP_CREDENTIAL_TABLES = new Set(["drive_accounts", "mail_sender_accounts"]);
const NULL_COLUMNS: Record<string, string[]> = { bank_accounts: ["token_encrypted", "token_set_at", "token_set_by_user_id"], authors: ["fio_token_encrypted", "fio_token_set_at"] };
const NEW_CODES: Record<string, string[]> = { children: ["portal_token"], families: ["portal_token"], participants: ["details_token"], ticket_orders: ["public_token"], settlement_links: ["token"], events: ["ticket_scan_token"] };

type Fk = { table: string; cols: string[]; ref: string; refCols: string[]; nullable: boolean };

async function main() {
  const mode = process.argv[2];
  if (!["dry", "run"].includes(mode)) throw new Error("mode: dry | run");
  const prodUrl = process.env.DATABASE_URL ?? "";
  const stagingUrl = process.env.STAGING_URL ?? "";
  if (!/@127\.0\.0\.1:55434\//.test(prodUrl)) throw new Error("refusing: DATABASE_URL is not the production read helper (:55434)");
  if (!/@127\.0\.0\.1:55440\//.test(stagingUrl) || process.env.APP_ENV !== "staging") throw new Error("refusing: STAGING_URL is not the staging DB (:55440)");
  const prod = new Client({ connectionString: prodUrl });
  const stg = new Client({ connectionString: stagingUrl });
  await prod.connect();
  await stg.connect();
  if (!(await stg.query("SELECT 1 FROM app_settings WHERE key = 'staging_marker'")).rowCount) throw new Error("refusing: no staging marker in the target");
  if ((await prod.query("SELECT 1 FROM app_settings WHERE key = 'staging_marker'")).rowCount) throw new Error("refusing: the source has a staging marker");


  await prod.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const ev = await prod.query("SELECT id FROM events WHERE name = $1", [EXCLUDE_EVENT_NAME]);
  if (ev.rowCount !== 1) throw new Error(`expected exactly one event "${EXCLUDE_EVENT_NAME}", found ${ev.rowCount}`);
  const tables: string[] = (await prod.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).rows.map((r) => r.tablename);
  const pk = new Map<string, string[]>();
  for (const r of (await prod.query(`SELECT tc.table_name t, array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position)::text[] cols FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' GROUP BY tc.table_name`)).rows) pk.set(r.t, r.cols);
  const fks: Fk[] = (await prod.query(`
    SELECT c.conrelid::regclass::text "table", c.confrelid::regclass::text ref,
      array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i)::text[] cols,
      array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i)::text[] "refCols",
      bool_or(NOT a2.attnotnull) nullable
    FROM pg_constraint c JOIN pg_attribute a2 ON a2.attrelid = c.conrelid AND a2.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace GROUP BY c.oid, c.conrelid, c.confrelid, c.conkey, c.confkey`)).rows.map((r) => ({ ...r, table: r.table.replace(/"/g, ""), ref: r.ref.replace(/"/g, "") }));

  // Excluded rows, by table: the event, then every row whose foreign key points at an excluded row (any column,
  // nullable or not -- a log row about an excluded participant is that participant's data too), until nothing changes.
  const excluded = new Map<string, Set<string>>([["events", new Set([ev.rows[0].id])]]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const fk of fks) {
      const parents = excluded.get(fk.ref);
      const key = pk.get(fk.table);
      if (!parents?.size || fk.cols.length !== 1 || fk.refCols.length !== 1 || fk.refCols[0] !== (pk.get(fk.ref) ?? [])[0] || !key || key.length !== 1) continue;
      const rows = await prod.query(`SELECT "${key[0]}"::text id FROM "${fk.table}" WHERE "${fk.cols[0]}"::text = ANY($1)`, [[...parents]]);
      const set = excluded.get(fk.table) ?? new Set<string>();
      for (const r of rows.rows) if (!set.has(r.id)) (set.add(r.id), (changed = true));
      excluded.set(fk.table, set);
    }
  }

  const where = (t: string): { sql: string; params: unknown[] } => {
    const parts: string[] = [];
    const params: unknown[] = [];
    const key = pk.get(t);
    const own = excluded.get(t);
    if (own?.size && key?.length === 1) {
      params.push([...own]);
      parts.push(`NOT ("${key[0]}"::text = ANY($${params.length}))`);
    }
    // Composite-key rows (link tables) pointing at an excluded row.
    for (const fk of fks.filter((f) => f.table === t && f.cols.length === 1 && excluded.get(f.ref)?.size)) {
      params.push([...excluded.get(fk.ref)!]);
      parts.push(`("${fk.cols[0]}" IS NULL OR NOT ("${fk.cols[0]}"::text = ANY($${params.length})))`);
    }
    return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
  };

  const plan: { table: string; copy: number; left: number }[] = [];
  for (const t of tables) {
    if (SKIP.has(t) || DROP_CREDENTIAL_TABLES.has(t)) continue;
    const w = where(t);
    const all = Number((await prod.query(`SELECT count(*) n FROM "${t}"`)).rows[0].n);
    const copy = Number((await prod.query(`SELECT count(*) n FROM "${t}" ${w.sql}`, w.params)).rows[0].n);
    plan.push({ table: t, copy, left: all - copy });
  }
  console.log("excluded event: 1 | tables copied:", plan.length, "| skipped:", [...SKIP, ...DROP_CREDENTIAL_TABLES].join(", "));
  console.log("left out because of the excluded event:", plan.filter((p) => p.left).map((p) => `${p.table}=${p.left}`).join(" ") || "none");
  console.log("rows to copy:", plan.reduce((n, p) => n + p.copy, 0));
  if (!plan.find((p) => p.table === "events")?.left) throw new Error("refusing: the excluded event is not left out (filter not working)");
  if (mode === "dry") {
    await prod.query("ROLLBACK");
    return finish(prod, stg);
  }

  // ---- run: replace staging's data in ONE transaction (all or nothing), foreign keys checked on every insert --------
  const copied = plan.map((p) => p.table);
  const copiedSet = new Set(copied);
  // Insert order: a table after the tables it points at. A reference that closes a loop (or points at its own
  // table) is inserted empty and filled in after all rows exist; references to left-out credential rows stay empty.
  const nullOnInsert = new Map<string, Set<string>>();
  const fillLater: Fk[] = [];
  const add = (t: string, c: string) => nullOnInsert.set(t, (nullOnInsert.get(t) ?? new Set()).add(c));
  for (const fk of fks) if (DROP_CREDENTIAL_TABLES.has(fk.ref) && copiedSet.has(fk.table) && fk.cols.length === 1) add(fk.table, fk.cols[0]);
  let edges = fks.filter((f) => copiedSet.has(f.table) && copiedSet.has(f.ref) && f.cols.length === 1);
  for (const fk of edges.filter((f) => f.table === f.ref)) (add(fk.table, fk.cols[0]), fillLater.push(fk));
  edges = edges.filter((f) => f.table !== f.ref);
  const order: string[] = [];
  const left = new Set(copied);
  while (left.size) {
    const ready = [...left].filter((t) => !edges.some((e) => e.table === t && left.has(e.ref)));
    if (ready.length) {
      for (const t of ready) (order.push(t), left.delete(t));
      continue;
    }
    // A loop: defer one nullable reference inside it.
    const cut = edges.find((e) => left.has(e.table) && left.has(e.ref) && e.nullable);
    if (!cut) throw new Error("a loop of required references -- can't order the copy");
    add(cut.table, cut.cols[0]);
    fillLater.push(cut);
    edges = edges.filter((e) => e !== cut);
  }

  await stg.query("BEGIN");
  await stg.query(`TRUNCATE ${[...copied, ...DROP_CREDENTIAL_TABLES].map((t) => `"${t}"`).join(", ")} CASCADE`);
  const kept = new Map<string, unknown[]>();
  for (const t of order) {
    const w = where(t);
    const rows = (await prod.query(`SELECT row_to_json(x) j FROM "${t}" x ${w.sql}`, w.params)).rows.map((r) => r.j as Record<string, unknown>);
    if (fillLater.some((f) => f.table === t)) kept.set(t, rows);
    const blank = nullOnInsert.get(t);
    const out = blank ? rows.map((r) => ({ ...r, ...Object.fromEntries([...blank].map((c) => [c, null])) })) : rows;
    for (let i = 0; i < out.length; i += 500) await stg.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(out.slice(i, i + 500))]);
  }
  for (const fk of fillLater) {
    const key = pk.get(fk.table)![0];
    const rows = (kept.get(fk.table) ?? []) as Record<string, unknown>[];
    const pairs = rows.filter((r) => r[fk.cols[0]] !== null && r[fk.cols[0]] !== undefined).map((r) => ({ [key]: r[key], [fk.cols[0]]: r[fk.cols[0]] }));
    for (let i = 0; i < pairs.length; i += 500)
      await stg.query(`UPDATE "${fk.table}" t SET "${fk.cols[0]}" = x."${fk.cols[0]}" FROM json_populate_recordset(NULL::"${fk.table}", $1::json) x WHERE t."${key}" = x."${key}"`, [JSON.stringify(pairs.slice(i, i + 500))]);
  }
  // Credentials: emptied, link codes new.
  for (const [t, cols] of Object.entries(NULL_COLUMNS)) await stg.query(`UPDATE "${t}" SET ${cols.map((c) => `"${c}" = NULL`).join(", ")}`);
  for (const [t, cols] of Object.entries(NEW_CODES)) for (const c of cols) await stg.query(`UPDATE "${t}" SET "${c}" = md5(random()::text || clock_timestamp()::text || ctid::text) WHERE "${c}" IS NOT NULL`);
  // Every reference must resolve (they were checked on insert; this also covers the filled-in ones).
  let broken = 0;
  for (const fk of fks.filter((f) => f.cols.length === 1 && !SKIP.has(f.table) && !SKIP.has(f.ref))) {
    const n = Number((await stg.query(`SELECT count(*) n FROM "${fk.table}" c WHERE c."${fk.cols[0]}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${fk.ref}" p WHERE p."${fk.refCols[0]}" = c."${fk.cols[0]}")`)).rows[0].n);
    if (n) {
      console.log(`broken reference: ${fk.table}.${fk.cols[0]} -> ${fk.ref}: ${n}`);
      broken += n;
    }
  }
  if (broken) {
    await stg.query("ROLLBACK");
    throw new Error(`rolled back: ${broken} broken references (staging unchanged)`);
  }
  // Integer sequences follow the copied data.
  for (const r of (await stg.query(`SELECT s.relname seq, t.relname tbl, a.attname col FROM pg_class s JOIN pg_depend d ON d.objid = s.oid JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid WHERE s.relkind = 'S'`)).rows)
    await stg.query(`SELECT setval('"${r.seq}"', GREATEST((SELECT COALESCE(max("${r.col}"), 0) FROM "${r.tbl}"), 1))`);
  await stg.query("COMMIT");
  await prod.query("ROLLBACK");
  console.log("copied:", plan.filter((p) => p.copy).map((p) => `${p.table}=${p.copy}`).join(" "));
  return finish(prod, stg);
}

async function finish(a: Client, b: Client) {
  await a.end();
  await b.end();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
