import { NextRequest, NextResponse } from "next/server";
import { linkedAccount, requireBank } from "@/lib/bank/guard";
import { syncFio, syncSheet } from "@/lib/bank/sync";

export const maxDuration = 120;

// "Synchronizovat": Fio -> the event's window; Sheet -> re-read with the saved mapping.
// A Fio refusal (30 s pause, history > 90 days...) is a status for the screen, never a 500.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const { id, accountId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const link = await linkedAccount(id, accountId);
  if (link instanceof NextResponse) return link;
  const r = link.bankAccount.sourceType === "sheet" ? await syncSheet(id, link, ctx.user.id) : await syncFio(id, link, ctx.user.id);
  return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
}
