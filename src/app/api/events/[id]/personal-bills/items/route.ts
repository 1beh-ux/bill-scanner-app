import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personalGuard } from "@/lib/personal-bills-server";

// "Čárky" items (pivo, limonáda…) with a base price per piece -- the organization's (ListTemplate personal_item),
// reused by every event; the price can still change per tally. GET, POST { name, unitPrice }, PATCH { id, name?,
// unitPrice?, active? }, DELETE ?itemId=. Anyone with the event's Účtenky grant (they are just prices).
const parse = (v: unknown) => Number(String(v ?? "").replace(",", "."));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const rows = await prisma.listTemplate.findMany({ where: { organizationId: g.event.organizationId, kind: "personal_item" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, active: r.active, unitPrice: Number((r.data as { unitPrice?: number } | null)?.unitPrice ?? 0) })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; unitPrice?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  const unitPrice = parse(b.unitPrice);
  if (!name || !(unitPrice > 0 && unitPrice < 100000)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const count = await prisma.listTemplate.count({ where: { organizationId: g.event.organizationId, kind: "personal_item" } });
  const row = await prisma.listTemplate.create({ data: { organizationId: g.event.organizationId, kind: "personal_item", name, sortOrder: count, data: { unitPrice } } });
  return NextResponse.json({ id: row.id }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; name?: unknown; unitPrice?: unknown; active?: unknown };
  const row = typeof b.id === "string" ? await prisma.listTemplate.findFirst({ where: { id: b.id, organizationId: g.event.organizationId, kind: "personal_item" } }) : null;
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const unitPrice = b.unitPrice === undefined ? undefined : parse(b.unitPrice);
  if (unitPrice !== undefined && !(unitPrice > 0 && unitPrice < 100000)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await prisma.listTemplate.update({
    where: { id: row.id },
    data: {
      ...(typeof b.name === "string" && b.name.trim() && { name: b.name.trim().slice(0, 60) }),
      ...(typeof b.active === "boolean" && { active: b.active }),
      ...(unitPrice !== undefined && { data: { unitPrice } }),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const r = await prisma.listTemplate.deleteMany({ where: { id: new URL(req.url).searchParams.get("itemId") ?? "", organizationId: g.event.organizationId, kind: "personal_item" } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
