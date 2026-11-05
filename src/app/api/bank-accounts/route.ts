import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { ACCOUNT_NUMBER, BANK_ACCOUNT_SELECT, FIO_BANK_CODE, accountKindOf } from "@/lib/bank/accounts";

// Organizace -> Připojení -> Banka (organization admin): the acting organization's Fio accounts.
// GET also serves the event settings' account select. No token, ever; non-admins (N1, audit2) get only what
// the select needs -- label, bank code, the last 4 digits, whether a token is set -- not the account number,
// token dates or the events using it. Saving a choice checks the exact account on the server.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({
    where: { organizationId: await getActingOrgId(user) },
    select: BANK_ACCOUNT_SELECT,
    orderBy: { createdAt: "asc" },
  });
  if (!isOrgAdmin(user)) {
    const reduced = accounts.filter((a) => a.active).map((a) => ({ id: a.id, label: a.label, bankCode: a.bankCode, last4: a.accountNumber.slice(-4), tokenSet: !!a.tokenSetAt }));
    return NextResponse.json({ accounts: reduced, canEdit: false });
  }
  return NextResponse.json({ accounts, canEdit: true });
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
  const account = await prisma.bankAccount.create({ data: { organizationId, label, accountNumber, bankCode: FIO_BANK_CODE, kind: accountKindOf(body.kind) ?? "organization" }, select: { id: true } });
  return NextResponse.json(account);
}
