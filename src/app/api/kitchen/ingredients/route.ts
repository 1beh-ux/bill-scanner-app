import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryGuard } from "@/lib/kitchen/server";
import { ingredientInput } from "@/lib/kitchen/library-server";

// Knihovna -> Suroviny (the acting organization's): GET (?all=1 with inactive), POST a new one.
export async function GET(req: NextRequest) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const rows = await prisma.ingredient.findMany({ where: { organizationId: g.organizationId, ...(all ? {} : { active: true }) }, include: { _count: { select: { mealUses: true } } }, orderBy: { nameKey: "asc" } });
  return NextResponse.json(rows.map(({ _count, packSize, ...r }) => ({ ...r, packSize: packSize == null ? null : Number(packSize), uses: _count.mealUses })));
}

export async function POST(req: NextRequest) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const input = ingredientInput((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (await prisma.ingredient.findUnique({ where: { organizationId_nameKey: { organizationId: g.organizationId, nameKey: input.nameKey! } }, select: { id: true } })) return NextResponse.json({ error: "duplicate" }, { status: 409 });
  const row = await prisma.ingredient.create({ data: { ...(input as { name: string; nameKey: string; unit: "g" | "ml" | "ks" }), organizationId: g.organizationId } });
  return NextResponse.json(row, { status: 201 });
}
