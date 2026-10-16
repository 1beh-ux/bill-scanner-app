import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { attachDriveFile, findDocument, replaceWithBill } from "@/lib/bank/document";

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

// "Najít doklad" on a bill without a document.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const [found, authors] = await Promise.all([
    findDocument(a.bill.id, a.user),
    prisma.author.findMany({ where: { eventAccess: { some: { eventId: a.bill.eventId } }, active: true }, select: { id: true, canonicalName: true }, orderBy: { canonicalName: "asc" } }),
  ]);
  return NextResponse.json({ ...found, authors, assignee: a.bill.missingDocAssigneeAuthorId });
}

/** { action: "replace", billId } | { action: "drive", fileId, name } | { action: "assign", authorId } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => ({}));
  if (body.action === "replace" && typeof body.billId === "string") {
    const r = await replaceWithBill({ placeholderId: a.bill.id, foundBillId: body.billId, user: a.user });
    return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
  }
  if (body.action === "drive" && typeof body.fileId === "string") {
    const r = await attachDriveFile({ billId: a.bill.id, fileId: body.fileId, name: typeof body.name === "string" ? body.name : "doklad.pdf", userId: a.user.id });
    return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
  }
  if (body.action === "assign") {
    const authorId = typeof body.authorId === "string" && body.authorId ? body.authorId : null;
    const event = await prisma.event.findUniqueOrThrow({ where: { id: a.bill.eventId }, select: { organizationId: true } });
    if (authorId && !(await prisma.author.count({ where: { id: authorId, organizationId: event.organizationId } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await prisma.bill.update({ where: { id: a.bill.id }, data: { missingDocAssigneeAuthorId: authorId } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
