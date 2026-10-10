import { NextResponse } from "next/server";
import { requireOrgBankAccount } from "@/lib/org-scope";
import { checkBankAccount } from "@/lib/bank/check";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireOrgBankAccount((await params).id);
  if ("error" in scope) return scope.error;
  return NextResponse.json(await checkBankAccount(scope.accountId, { reason: "admin" }));
}
