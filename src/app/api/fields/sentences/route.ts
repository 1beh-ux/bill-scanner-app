// Redesign R10 (Q-R4): the organization's wording of the sentence variables -- GET defaults + own, PUT {key, text}
// (empty text = back to the default). Admins of a flagged organization only.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSentenceKey, orgSentences, saveSentence, SENTENCES } from "@/lib/sentences";
import { fieldsManagerAccess } from "../access";

export async function GET() {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  return NextResponse.json({ defaults: Object.fromEntries(Object.entries(SENTENCES).map(([k, v]) => [k, v.text])), own: await orgSentences(a.organizationId) });
}

export async function PUT(req: NextRequest) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { key?: unknown; text?: unknown };
  if (typeof b.key !== "string" || !isSentenceKey(b.key) || (b.text !== null && typeof b.text !== "string")) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const before = await orgSentences(a.organizationId);
  await saveSentence(a.organizationId, b.key, b.text as string | null);
  await prisma.fieldChangeLog.create({ data: { organizationId: a.organizationId, action: "sentence", byId: a.userId, before: { key: b.key, text: before[b.key] ?? null }, after: { key: b.key, text: (b.text as string | null) ?? null } } });
  return NextResponse.json({ ok: true });
}
