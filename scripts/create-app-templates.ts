// Organizations step 4: the app-level starter set. Copies every template of an
// organization (default "Pionýrská skupina Záře", or SOURCE_ORGANIZATION) to the app
// level (organization_id NULL) and points the organization's rows at their app copy
// (sourceTemplateId), so they show as "Výchozí" and can later be restored from it.
// App copies drop Google Doc ids and bank details from data/options; texts stay as they
// are -- the flagged list says what to review in Aplikace -> Šablony aplikace.
// npx tsx scripts/create-app-templates.ts           -- dry run: what would be copied + flagged values
// npx tsx scripts/create-app-templates.ts --apply   -- copies (one transaction), then the flagged list again
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { TEMPLATE_TABLES, flagOrgSpecific, clearOrgSettings, tableSpec, templateContent, templateDelegate, templateData } = await import("../src/lib/app-templates");
  const name = process.env.SOURCE_ORGANIZATION || "Pionýrská skupina Záře";
  const org = await prisma.organization.findFirst({ where: { name } });
  if (!org) throw new Error(`organization "${name}" not found`);

  const label = (r: Record<string, unknown>) => String(r.name ?? r.label ?? r.purposeKey ?? r.key ?? r.id);
  const flags = (table: string, rows: Record<string, unknown>[], fields: string[]) => {
    const out: string[] = [];
    for (const r of rows) {
      const text = fields.map((f) => (typeof r[f] === "string" ? r[f] : r[f] == null ? "" : JSON.stringify(r[f]))).join("\n");
      for (const hit of flagOrgSpecific(text)) out.push(`  [${table}] ${label(r)} -- ${hit}`);
    }
    return out;
  };

  const plan: { table: (typeof TEMPLATE_TABLES)[number]; copy: Record<string, unknown>[]; link: { orgId: string; appId: string }[]; skip: number }[] = [];
  const flagged: string[] = [];
  for (const table of TEMPLATE_TABLES) {
    const d = templateDelegate(prisma, table);
    const spec = tableSpec(table);
    const [own, app] = await Promise.all([d.findMany({ where: { organizationId: org.id } }), d.findMany({ where: { organizationId: null } })]);
    const appIds = new Set(app.map((a) => a.id));
    const appByIdentity = new Map(app.map((a) => [spec.identity(a), a.id]));
    const entry = { table, copy: [] as Record<string, unknown>[], link: [] as { orgId: string; appId: string }[], skip: 0 };
    for (const r of own) {
      if (r.sourceTemplateId && appIds.has(r.sourceTemplateId)) entry.skip++;
      else if (appByIdentity.has(spec.identity(r))) entry.link.push({ orgId: r.id, appId: appByIdentity.get(spec.identity(r))! });
      else entry.copy.push(r);
    }
    plan.push(entry);
    flagged.push(...flags(table, own, spec.fields));
  }

  console.log(`source: ${org.name}`);
  for (const p of plan) console.log(`${p.table.padEnd(9)} copy to app: ${String(p.copy.length).padStart(3)}   link to an existing app item: ${p.link.length}   already linked: ${p.skip}`);
  console.log(`\nvalues that look organization-specific (${flagged.length}):`);
  console.log(flagged.join("\n") || "  (none)");
  if (!apply) return console.log("\ndry run -- rerun with --apply");

  await prisma.$transaction(
    async (tx) => {
      for (const p of plan) {
        const d = templateDelegate(tx, p.table);
        for (const r of p.copy) {
          const data = templateData(templateContent(p.table, r));
          for (const k of ["data", "options"]) if (data[k] !== undefined) data[k] = clearOrgSettings(data[k]);
          const created = await d.create({ data: { ...data, organizationId: null } });
          await d.update({ where: { id: String(r.id) }, data: { sourceTemplateId: created.id } });
        }
        for (const l of p.link) await d.update({ where: { id: l.orgId }, data: { sourceTemplateId: l.appId } });
      }
    },
    { timeout: 120_000 }
  );

  const after: string[] = [];
  for (const table of TEMPLATE_TABLES) {
    const app = await templateDelegate(prisma, table).findMany({ where: { organizationId: null } });
    after.push(...flags(table, app, tableSpec(table).fields));
  }
  console.log(`\napplied. App templates now: ${(await Promise.all(TEMPLATE_TABLES.map((t) => templateDelegate(prisma, t).findMany({ where: { organizationId: null } })))).map((rows, i) => `${TEMPLATE_TABLES[i]} ${rows.length}`).join(", ")}`);
  console.log(`still to review in Aplikace -> Šablony aplikace (${after.length}):`);
  console.log(after.join("\n") || "  (none)");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
