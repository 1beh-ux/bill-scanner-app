import { NextResponse } from "next/server";

// The Fio token is set only in Organizace -> Připojení (one place of truth, audit 2026-11-05):
// /api/bank-accounts/[id]/token. This old event-level endpoint refuses and says where.
export async function PUT() {
  return NextResponse.json({ status: "use_connections" }, { status: 409 });
}
