import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { ACCOUNT_NUMBER, BANK_ACCOUNT_SELECT, FIO_BANK_CODE } from "@/lib/bank/accounts";

// Organizace -> Připojení -> Banka (organization admin): the acting organization's Fio accounts.
// GET also serves the event settings' account select (any signed-in user; no token, ever).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({
    where: { organizationId: await getActingOrgId(user) },
    select: BANK_ACCOUNT_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ accounts, canEdit: isOrgAdmin(user) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.replace(/\s/g, "") : "";
  if (!label || !ACCOUNT_NUMBER.test(accountNumber)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const organizationId = await getActingOrgId(user);
  if (await prisma.bankAccount.count({ where: { organizationId, accountNumber, bankCode: FIO_BANK_CODE } })) return NextResponse.json({ error: "exists" }, { status: 409 });
  const account = await prisma.bankAccount.create({ data: { organizationId, label, accountNumber, bankCode: FIO_BANK_CODE }, select: { id: true } });
  return NextResponse.json(account);
}
