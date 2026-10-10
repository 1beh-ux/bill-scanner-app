import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { pullFromApp, restoreFromApp, syncStatus, TEMPLATE_TABLES, type TemplateTable } from "@/lib/app-templates";
import { prisma } from "@/lib/prisma";

// Organizace -> Šablony vs. the app templates (organizations step 4), for the acting
// organization's admin. GET ?table=&filter=: each item's badge (Výchozí / Upraveno /
// Vlastní) + what differs ("Porovnat"). POST { action: "restore", table, id }
// ("Obnovit z aplikace") or { action: "pull", table, filter? } ("Načíst nové z aplikace").
// Nothing here ever changes the app templates.
async function access(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user), req };
}
const tableOf = (v: unknown): TemplateTable | null => (TEMPLATE_TABLES.includes(v as TemplateTable) ? (v as TemplateTable) : null);

export async function GET(req: NextRequest) {
  const a = await access(req);
  if ("error" in a) return a.error;
  const params = new URL(req.url).searchParams;
  const table = tableOf(params.get("table"));
  if (!table) return NextResponse.json({ error: "bad_table" }, { status: 400 });
  return NextResponse.json(await syncStatus(table, a.organizationId, params.get("filter")));
}

export async function POST(req: NextRequest) {
  const a = await access(req);
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => ({}));
  const table = tableOf(body.table);
  if (!table) return NextResponse.json({ error: "bad_table" }, { status: 400 });
  if (body.action === "restore") {
    if (typeof body.id !== "string" || !(await restoreFromApp(table, a.organizationId, body.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "pull") {
    const filter = typeof body.filter === "string" && body.filter ? body.filter : null;
    return NextResponse.json({ created: await pullFromApp(prisma, table, a.organizationId, filter) });
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
