import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgBankAccount } from "@/lib/org-scope";
import { BANK_ACCOUNT_SELECT } from "@/lib/bank/accounts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = await requireOrgBankAccount((await params).id);
  if ("error" in scope) return scope.error;
  const body = await req.json().catch(() => ({}));
  const data: { label?: string; active?: boolean } = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (typeof body.active === "boolean") data.active = body.active;
  const account = await prisma.bankAccount.update({ where: { id: scope.accountId }, data, select: BANK_ACCOUNT_SELECT });
  return NextResponse.json(account);
}

/** Odpojit: forget the token, switch the check off on every event using it; ?withMovements=1 also deletes its stored movements. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await requireOrgBankAccount((await params).id);
  if ("error" in scope) return scope.error;
  const id = scope.accountId;
  await prisma.$transaction([
    prisma.event.updateMany({ where: { bankAccountId: id }, data: { bankCheckEnabled: false } }),
    prisma.bankAccount.update({ where: { id }, data: { tokenEncrypted: null, tokenSetAt: null, tokenSetByUserId: null, lastError: null } }),
    ...(req.nextUrl.searchParams.get("withMovements") === "1" ? [prisma.bankMovement.deleteMany({ where: { bankAccountId: id } })] : []),
  ]);
  return NextResponse.json({ ok: true });
}
