import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// "Platí trvale" on an org document-type template (docs/registration-slice6-spec.md 1):
// stored as ListTemplate.data.permanent; event document types copied from the
// template are matched to it by key. A template made in the UI has no key yet
// (nor do its event copies): switching it on gives it its id as the key, and
// its event copies (isFromTemplate, same name -- the rule the template sync
// matches by) get the same key.
async function load(params: Promise<{ id: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  const template = await prisma.listTemplate.findUnique({ where: { id: (await params).id } });
  if (!template || template.kind !== "document") return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { user, template };
}

/** The template's event document types: by key, or (no key yet) its copies by name. */
const itemsOf = (t: { key: string | null; name: string }) => (t.key ? { key: t.key } : { key: null, isFromTemplate: true, name: t.name });

// POST { permanent: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { template, error } = await load(params);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.permanent !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const data = { ...(template.data as Prisma.JsonObject | null) };
  delete data.permanent;
  if (body.permanent) data.permanent = true;
  const key = template.key ?? (body.permanent ? template.id : null);
  await prisma.$transaction([
    ...(key && !template.key ? [prisma.eventListItem.updateMany({ where: { kind: "document", ...itemsOf(template) }, data: { key } })] : []),
    prisma.listTemplate.update({ where: { id: template.id }, data: { data, key } }),
  ]);
  return NextResponse.json({ ok: true });
}
