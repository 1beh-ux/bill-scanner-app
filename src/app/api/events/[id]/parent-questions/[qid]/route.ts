import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANSWER_MAX, QUESTION_MAX, readOptions } from "@/lib/parent-questions";
import { questionsGuard as guard } from "@/lib/parent-questions-server";

// One question: PATCH { answer?: string | null, question?, options? } (null / "" = not answered yet); DELETE.
const own = (eventId: string, qid: string) => prisma.parentQuestion.findFirst({ where: { id: qid, participant: { eventId } }, select: { id: true } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const { id, qid } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, qid))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { answer?: unknown; question?: unknown; options?: unknown };
  const answer = body.answer === undefined ? undefined : typeof body.answer === "string" ? body.answer.trim().slice(0, ANSWER_MAX) || null : null;
  const question = typeof body.question === "string" && body.question.trim() ? body.question.trim().slice(0, QUESTION_MAX) : undefined;
  await prisma.parentQuestion.update({
    where: { id: qid },
    data: {
      ...(answer !== undefined && { answer, answeredAt: answer ? new Date() : null }),
      ...(question && { question }),
      ...(body.options !== undefined && { options: readOptions(body.options) }),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const { id, qid } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, qid))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.parentQuestion.delete({ where: { id: qid } });
  return NextResponse.json({ ok: true });
}
