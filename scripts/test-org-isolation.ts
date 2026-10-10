// Organizations step 2: proves a second organization sees none of Záře's data
// through the REAL route handlers (docs/organizations-change-notes.md).
// Run with the test tsconfig (stubs getCurrentUser + next/headers, no prod code hook):
//   npx tsx --tsconfig tsconfig.org-isolation.json scripts/test-org-isolation.ts         -- dry run: the plan, creates nothing
//   npx tsx --tsconfig tsconfig.org-isolation.json scripts/test-org-isolation.ts --run   -- creates, checks, deletes (also on failure)
import { NextRequest } from "next/server";
import type { User } from "@/generated/prisma";

const TEST_ORG = "Test org (isolation)";
const ZARE = "Pionýrská skupina Záře";

type R = { ok: boolean; name: string; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push({ ok, name, detail: ok ? undefined : detail });

const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`https://tabornik.online${path}`, {
    method: init?.method ?? "GET",
    headers: { host: "tabornik.online", "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });

async function main() {
  const run = process.argv.includes("--run");
  const { prisma } = await import("@/lib/prisma");
  const zare = await prisma.organization.findFirst({ where: { name: ZARE } });
  if (!zare) throw new Error(`${ZARE} not found`);
  const z = {
    event: await prisma.event.findFirst({ where: { organizationId: zare.id }, select: { id: true } }),
    bill: await prisma.bill.findFirst({ where: { event: { organizationId: zare.id } }, select: { id: true } }),
    child: await prisma.child.findFirst({ where: { organizationId: zare.id, dateOfBirth: { not: null } }, select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true } }),
    family: await prisma.family.findFirst({ where: { organizationId: zare.id }, select: { id: true } }),
    author: await prisma.author.findFirst({ where: { organizationId: zare.id }, select: { id: true } }),
    categoryTemplate: await prisma.categoryTemplate.findFirst({ where: { organizationId: zare.id }, select: { id: true } }),
    listTemplate: await prisma.listTemplate.findFirst({ where: { organizationId: zare.id }, select: { id: true } }),
    fieldTemplate: await prisma.participantFieldTemplate.findFirst({ where: { organizationId: zare.id }, select: { key: true } }),
  };
  console.log("Záře sample ids:", Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v ? ("id" in v ? v.id : v.key) : "(none)"])));
  if (!run) {
    console.log(`\ndry run: would create "${TEST_ORG}" + one admin user + one event (through POST /api/events) + one participant mirroring ${z.child?.name ?? "(no Záře child with a birth date)"},`);
    console.log("call the list/detail route handlers as that admin, assert no Záře data / 404s, then delete everything it created. Rerun with --run.");
    return;
  }

  const stamp = Date.now();
  const org = await prisma.organization.create({ data: { name: TEST_ORG, shortName: "Test", contactEmail: null } });
  let admin: User | null = null;
  let eventId: string | null = null;
  try {
    admin = await prisma.user.create({ data: { email: `org-isolation-${stamp}@test.invalid`, displayName: "Isolation test", role: "admin", organizationId: org.id } });
    (globalThis as { __orgTestUser?: User | null }).__orgTestUser = admin;

    // --- creating through the real route lands in the test organization
    const events = await import("@/app/api/events/route");
    const created = await json(await events.POST(req("/api/events", { method: "POST", body: { name: `Isolation ${stamp}`, startDate: "2027-07-01", endDate: "2027-07-10" } })));
    eventId = created.body?.id ?? null;
    check("POST /api/events creates the event in the acting organization", created.status === 201 && created.body?.organizationId === org.id, JSON.stringify(created));
    if (!eventId) throw new Error("test event not created");

    // --- lists: nothing of Záře's
    const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map((x: { id?: string; key?: string }) => x.id ?? x.key ?? "") : []);
    const listEvents = await json(await events.GET(req("/api/events")));
    check("events list (switcher, move targets): only the test event", JSON.stringify(ids(listEvents.body)) === JSON.stringify([eventId]), JSON.stringify(ids(listEvents.body)));
    const users = await json(await (await import("@/app/api/users/route")).GET());
    check("users list: only the test admin", JSON.stringify(ids(users.body)) === JSON.stringify([admin.id]), JSON.stringify(ids(users.body)));
    const authors = await json(await (await import("@/app/api/authors/route")).GET());
    check("payers list: empty", ids(authors.body).length === 0, JSON.stringify(ids(authors.body)));
    const children = await (await import("@/app/api/children/route")).GET(req("/api/children"));
    const ch = (await children.json()) as { children: unknown[]; unlinked: unknown[]; pendingChanges: unknown[] };
    check("people (Lidé) list: empty", ch.children.length === 0 && ch.unlinked.length === 0 && ch.pendingChanges.length === 0, `children ${ch.children.length}, unlinked ${ch.unlinked.length}, changes ${ch.pendingChanges.length}`);
    const picker = await json(await (await import("@/app/api/children/route")).GET(req("/api/children?list=1")));
    check("people picker: empty", ids(picker.body).length === 0, JSON.stringify(ids(picker.body)));
    const fam = await json(await (await import("@/app/api/families/route")).GET());
    check("families list: empty", (fam.body?.families?.length ?? -1) === 0, JSON.stringify(fam.body)?.slice(0, 200));
    const cats = await json(await (await import("@/app/api/category-templates/route")).GET(req("/api/category-templates")));
    check("category templates: empty", ids(cats.body).length === 0, JSON.stringify(ids(cats.body)));
    const listTpl = await import("@/app/api/list-templates/route");
    let listLeak = 0;
    for (const kind of ["med", "situation", "document", "plan_activity"]) listLeak += ids((await json(await listTpl.GET(req(`/api/list-templates?kind=${kind}`)))).body).length;
    check("list templates (med/situation/document/plan_activity): empty", listLeak === 0, `${listLeak} rows`);
    const fields = await json(await (await import("@/app/api/participant-field-templates/route")).GET(req("/api/participant-field-templates")));
    check("participant field templates: empty", ids(fields.body).length === 0, JSON.stringify(ids(fields.body)));
    const mail = await json(await (await import("@/app/api/mail-accounts/route")).GET());
    check("mailboxes: empty", Array.isArray(mail.body) && mail.body.length === 0, JSON.stringify(mail.body));
    const hosts = await json(await (await import("@/app/api/public-hosts/route")).GET(req("/api/public-hosts")));
    check("public hosts: empty", (hosts.body?.hosts?.length ?? -1) === 0, JSON.stringify(hosts.body?.hosts));
    const overview = await json(await (await import("@/app/api/admin/overview/route")).GET());
    const ovEvents = ids(overview.body?.events);
    check("admin overview: only the test event, no Google accounts", JSON.stringify(ovEvents) === JSON.stringify([eventId]) && (overview.body?.googleAccounts?.length ?? -1) === 0, JSON.stringify({ ovEvents, accounts: overview.body?.googleAccounts?.length }));
    const access = await json(await (await import("@/app/api/events/[id]/module-access/route")).GET(req(`/api/events/${eventId}/module-access`), params({ id: eventId })));
    check("event access grid: only the test admin", JSON.stringify(ids(access.body)) === JSON.stringify([admin.id]), JSON.stringify(ids(access.body)));

    // --- Záře ids -> 404 (requests that would change something are rejected before any write)
    if (z.event) {
      const r = await (await import("@/app/api/events/[id]/route")).GET(req(`/api/events/${z.event.id}`), params({ id: z.event.id }));
      check("Záře event -> 404", r.status === 404, `HTTP ${r.status}`);
      const { hasModuleAccess } = await import("@/lib/module-access");
      check("hasModuleAccess(test admin, Záře event) = false", !(await hasModuleAccess(admin, z.event.id, "bills")), "true");
    }
    if (z.bill) {
      const r = await (await import("@/app/api/bills/[id]/route")).GET(req(`/api/bills/${z.bill.id}`), params({ id: z.bill.id }));
      check("Záře bill -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.child) {
      const r = await (await import("@/app/api/children/[id]/route")).GET(req(`/api/children/${z.child.id}`), params({ id: z.child.id }));
      check("Záře person -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.family) {
      // An unknown action: the org check answers 404 first; without it this would be a harmless 400.
      const r = await (await import("@/app/api/families/route")).POST(req("/api/families", { method: "POST", body: { action: "isolation-probe", familyId: z.family.id } }));
      check("Záře family -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.author) {
      const r = await (await import("@/app/api/authors/[id]/route")).GET(req(`/api/authors/${z.author.id}`), params({ id: z.author.id }));
      check("Záře payer -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.categoryTemplate) {
      const r = await (await import("@/app/api/category-templates/[id]/route")).PATCH(req(`/api/category-templates/${z.categoryTemplate.id}`, { method: "PATCH", body: {} }), params({ id: z.categoryTemplate.id }));
      check("Záře category template -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.listTemplate) {
      const r = await (await import("@/app/api/list-templates/[id]/route")).PATCH(req(`/api/list-templates/${z.listTemplate.id}`, { method: "PATCH", body: {} }), params({ id: z.listTemplate.id }));
      check("Záře list template -> 404", r.status === 404, `HTTP ${r.status}`);
    }
    if (z.fieldTemplate) {
      const k = encodeURIComponent(z.fieldTemplate.key);
      const r = await (await import("@/app/api/participant-field-templates/[key]/route")).PATCH(req(`/api/participant-field-templates/${k}`, { method: "PATCH", body: {} }), params({ key: k }));
      check("Záře participant field template -> 404", r.status === 404, `HTTP ${r.status}`);
    }

    // --- linkChildren never links to a Záře person with the same name + birth date
    if (z.child) {
      const p = await prisma.participant.create({
        data: { eventId, name: z.child.name, firstName: z.child.firstName, lastName: z.child.lastName, dateOfBirth: z.child.dateOfBirth },
      });
      const { linkChildren } = await import("@/lib/children");
      await linkChildren({ eventId });
      const after = await prisma.participant.findUniqueOrThrow({ where: { id: p.id }, select: { childId: true, child: { select: { organizationId: true } } } });
      check(
        `linkChildren: "${z.child.name}" (same name + birth date as a Záře person) is not linked to Záře`,
        after.childId !== z.child.id && (after.child === null || after.child.organizationId === org.id),
        JSON.stringify(after)
      );
    } else check("linkChildren mirror test", false, "no Záře person with a birth date to mirror");

    // ===== step 3: super-admin screens and role rules =====
    const setCookies = (c: Record<string, string>) => ((globalThis as { __orgTestCookies?: Record<string, string> }).__orgTestCookies = c);
    const asUser = (u: User) => ((globalThis as { __orgTestUser?: User | null }).__orgTestUser = u);
    const orgsRoute = await import("@/app/api/organizations/route");
    const actingRoute = await import("@/app/api/acting-org/route");
    const userRoute = await import("@/app/api/users/[id]/route");
    const member = await prisma.user.create({ data: { email: `org-isolation-member-${stamp}@test.invalid`, displayName: "Isolation member", role: "user", organizationId: org.id } });

    // An organization admin is not a super-admin.
    asUser(admin);
    let r = await orgsRoute.POST(req("/api/organizations", { method: "POST", body: { name: "x", shortName: "x", adminEmail: `x-${stamp}@test.invalid`, adminName: "x" } }));
    check("org admin: POST /api/organizations -> 403", r.status === 403, `HTTP ${r.status}`);
    r = await orgsRoute.GET();
    check("org admin: GET /api/organizations -> 403", r.status === 403, `HTTP ${r.status}`);
    r = await actingRoute.POST(req("/api/acting-org", { method: "POST", body: { organizationId: zare.id } }));
    check("org admin: POST /api/acting-org -> 403", r.status === 403, `HTTP ${r.status}`);
    r = await userRoute.PATCH(req(`/api/users/${member.id}`, { method: "PATCH", body: { role: "admin" } }), params({ id: member.id }));
    check("org admin: making someone admin -> 403", r.status === 403 && (await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role === "user", `HTTP ${r.status}`);
    r = await (await import("@/app/api/users/route")).POST(req("/api/users", { method: "POST", body: { email: `org-isolation-new-${stamp}@test.invalid`, displayName: "x", role: "admin" } }));
    check("org admin: creating an admin -> 403", r.status === 403, `HTTP ${r.status}`);

    // acting_org is ignored for anyone but a super-admin.
    setCookies({ acting_org: zare.id });
    const ignored = await json(await events.GET(req("/api/events")));
    check("acting_org cookie of a non-super-admin is ignored", JSON.stringify(ids(ignored.body)) === JSON.stringify([eventId]), JSON.stringify(ids(ignored.body)));

    // A super-admin acting in the test organization sees only it.
    const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true, active: true } });
    if (!superAdmin) throw new Error("no super-admin in the database");
    asUser(superAdmin);
    setCookies({ acting_org: org.id });
    const saEvents = await json(await events.GET(req("/api/events")));
    check("super-admin acting in the test org: events = only the test event", JSON.stringify(ids(saEvents.body)) === JSON.stringify([eventId]), JSON.stringify(ids(saEvents.body)));
    const saUsers = await json(await (await import("@/app/api/users/route")).GET());
    check("super-admin acting in the test org: users = only the test org's", JSON.stringify(ids(saUsers.body).sort()) === JSON.stringify([admin.id, member.id].sort()), JSON.stringify(ids(saUsers.body)));
    // Last active admin can't be deactivated (the super-admin isn't the target, so it's the last-admin rule).
    r = await userRoute.PATCH(req(`/api/users/${admin.id}`, { method: "PATCH", body: { active: false } }), params({ id: admin.id }));
    const lastBody = await r.json().catch(() => null);
    check("deactivating the last active admin is refused", r.status === 400 && lastBody?.error === "last_admin" && (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).active, JSON.stringify({ status: r.status, lastBody }));

    // A deactivated organization's public host answers 404.
    const hostname = `isolation-${stamp}.test.invalid`;
    await prisma.publicHost.create({ data: { hostname, purpose: "registration", organizationId: org.id, createdByUserId: superAdmin.id } });
    const { invalidatePublicHosts, resolvePublicHost } = await import("@/lib/public-host");
    invalidatePublicHosts();
    const before = await resolvePublicHost(new Headers({ host: hostname }));
    r = await (await import("@/app/api/organizations/[id]/route")).PATCH(req(`/api/organizations/${org.id}`, { method: "PATCH", body: { active: false } }), params({ id: org.id }));
    const after = await resolvePublicHost(new Headers({ host: hostname }));
    check("deactivated org: its public host is no longer served (resolves as unknown -> 404)", before.kind === "public" && r.status === 200 && after.kind === "unknown", JSON.stringify({ before: before.kind, status: r.status, after: after.kind }));
    r = await (await import("@/app/api/organizations/[id]/route")).PATCH(req(`/api/organizations/${superAdmin.organizationId}`, { method: "PATCH", body: { active: false } }), params({ id: superAdmin.organizationId }));
    check("super-admin can't deactivate their home organization", r.status === 400 && (await prisma.organization.findUniqueOrThrow({ where: { id: superAdmin.organizationId } })).active, `HTTP ${r.status}`);
    setCookies({});
  } finally {
    // --- cleanup: everything the test created, also on failure
    (globalThis as { __orgTestUser?: User | null }).__orgTestUser = null;
    (globalThis as { __orgTestCookies?: Record<string, string> }).__orgTestCookies = {};
    const errors: string[] = [];
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        errors.push(`${name}: ${(err as Error).message.split("\n")[0]}`);
      }
    };
    if (eventId) {
      const ev = { eventId };
      const pv = { participant: { eventId } };
      await step("mailActionLog", () => prisma.mailActionLog.deleteMany({ where: ev }));
      await step("participantDocument", () => prisma.participantDocument.deleteMany({ where: pv }));
      await step("participantGuardian", () => prisma.participantGuardian.deleteMany({ where: pv }));
      await step("participant", () => prisma.participant.deleteMany({ where: ev }));
      await step("eventParticipantField", () => prisma.eventParticipantField.deleteMany({ where: ev }));
      await step("eventListItem", () => prisma.eventListItem.deleteMany({ where: ev }));
      await step("eventCategory", () => prisma.eventCategory.deleteMany({ where: ev }));
      await step("eventModule", () => prisma.eventModule.deleteMany({ where: ev }));
      await step("userEventModuleAccess", () => prisma.userEventModuleAccess.deleteMany({ where: ev }));
      await step("authorEventAccess", () => prisma.authorEventAccess.deleteMany({ where: ev }));
      await step("eventEmailTemplate", () => prisma.eventEmailTemplate.deleteMany({ where: ev }));
      await step("planActivity", () => prisma.planActivity.deleteMany({ where: ev }));
      await step("planDay", () => prisma.planDay.deleteMany({ where: ev }));
      await step("event", () => prisma.event.deleteMany({ where: { id: eventId! } }));
    }
    const ov = { organizationId: org.id };
    await step("childGuardian", () => prisma.childGuardian.deleteMany({ where: { child: ov } }));
    await step("child", () => prisma.child.deleteMany({ where: ov }));
    await step("family", () => prisma.family.deleteMany({ where: ov }));
    await step("author", () => prisma.author.deleteMany({ where: ov }));
    await step("emailTemplate", () => prisma.emailTemplate.deleteMany({ where: ov }));
    await step("categoryTemplate", () => prisma.categoryTemplate.deleteMany({ where: ov }));
    await step("listTemplate", () => prisma.listTemplate.deleteMany({ where: ov }));
    await step("participantFieldTemplate", () => prisma.participantFieldTemplate.deleteMany({ where: ov }));
    await step("publicHost", () => prisma.publicHost.deleteMany({ where: ov }));
    await step("user", () => prisma.user.deleteMany({ where: ov }));
    await step("organization", () => prisma.organization.delete({ where: { id: org.id } }));
    const left = await prisma.organization.count({ where: { name: TEST_ORG } });
    console.log(`\ncleanup: ${errors.length ? `ERRORS -- ${errors.join("; ")}` : "ok"}; "${TEST_ORG}" rows left: ${left}`);
    if (errors.length || left) process.exitCode = 1;
  }

  console.log("");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `   -- ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
