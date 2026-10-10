// Organizations step 1 (docs/organizations-change-notes.md): every existing row
// belongs to "Pionýrská skupina Záře"; 1beh@zare.cz becomes super-admin.
// npx tsx scripts/migrate-organizations.ts           -- dry run: per table total / to update
// npx tsx scripts/migrate-organizations.ts --apply   -- one transaction, then the NULL counts (must be 0)
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const ORG = { name: "Pionýrská skupina Záře", shortName: "Záře", contactEmail: "1beh@zare.cz" };
const SUPER_ADMIN = "1beh@zare.cz";

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
  type Where = { where: { organizationId: null } | Record<string, never> };
  type Delegate = { count(args?: Where): Promise<number>; updateMany(args: { where: { organizationId: null }; data: { organizationId: string } }): Promise<{ count: number }> };
  // The 13 owned tables; a plain cast keeps one loop instead of 13 copies.
  const tables = (db: Db): [string, Delegate][] =>
    ([
      ["users", db.user], ["events", db.event], ["authors", db.author], ["children", db.child], ["families", db.family],
      ["drive_accounts", db.driveAccount], ["mail_sender_accounts", db.mailSenderAccount], ["public_hosts", db.publicHost],
      ["merchant_aliases", db.merchantAlias], ["category_templates", db.categoryTemplate], ["list_templates", db.listTemplate],
      ["email_templates", db.emailTemplate], ["participant_field_templates", db.participantFieldTemplate],
    ] as [string, unknown][]).map(([n, d]) => [n, d as Delegate]);

  const existing = await prisma.organization.findFirst({ where: { name: ORG.name } });
  console.log(existing ? `organization: reuse ${existing.id} (${existing.name})` : `organization: ${apply ? "create" : "would create"} ${ORG.name}`);
  const admin = await prisma.user.findUnique({ where: { email: SUPER_ADMIN }, select: { id: true, isSuperAdmin: true } });
  console.log(admin ? `super-admin ${SUPER_ADMIN}: is_super_admin ${admin.isSuperAdmin} -> true` : `super-admin ${SUPER_ADMIN}: USER NOT FOUND`);

  console.log("\ntable                          total  to update");
  for (const [name, d] of tables(prisma)) {
    const [total, nulls] = await Promise.all([d.count(), d.count({ where: { organizationId: null } })]);
    console.log(`${name.padEnd(30)} ${String(total).padStart(5)}  ${String(nulls).padStart(9)}`);
  }
  if (!apply) return console.log("\ndry run -- rerun with --apply");
  if (!admin) throw new Error(`${SUPER_ADMIN} not found -- nothing applied`);

  await prisma.$transaction(
    async (tx) => {
      const org = existing ?? (await tx.organization.create({ data: ORG }));
      for (const [name, d] of tables(tx)) {
        const { count } = await d.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } });
        console.log(`updated ${name}: ${count}`);
      }
      await tx.user.update({ where: { email: SUPER_ADMIN }, data: { isSuperAdmin: true } });
    },
    { timeout: 120_000 }
  );

  console.log("\nremaining NULL organization_id (must all be 0):");
  let left = 0;
  for (const [name, d] of tables(prisma)) {
    const n = await d.count({ where: { organizationId: null } });
    left += n;
    console.log(`${name.padEnd(30)} ${n}`);
  }
  console.log(`organizations: ${await prisma.organization.count()}, super-admins: ${(await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { email: true } })).map((u) => u.email).join(", ")}`);
  if (left) process.exitCode = 1;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => { console.error(err); process.exit(1); });
