import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { questionsGuard as guard } from "@/lib/parent-questions-server";
import { QUESTION_MAX, readOptions } from "@/lib/parent-questions";
import { compareParticipantsBySurname } from "@/lib/participant-name";

// "Dotazy na rodiče" of an event (src/lib/parent-questions.ts). GET [?participantId=] = the questions
// (open first), POST { participantId, question, options } = a new one. Whoever sees the participants.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const participantId = req.nextUrl.searchParams.get("participantId");
  const rows = await prisma.parentQuestion.findMany({
    where: { participant: { eventId: id }, ...(participantId && { participantId }) },
    include: { participant: { select: { id: true, name: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Open ones first, then by the child's surname (as the lists), then in the order they were noted.
  rows.sort((a, b) => Number(!!a.answer) - Number(!!b.answer) || compareParticipantsBySurname(a.participant, b.participant));
  return NextResponse.json(
    rows.map((q) => ({ id: q.id, participantId: q.participantId, participantName: q.participant.name, question: q.question, options: readOptions(q.options), answer: q.answer, answeredAt: q.answeredAt, createdAt: q.createdAt }))
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { participantId?: unknown; question?: unknown; options?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, QUESTION_MAX) : "";
  const participant = typeof body.participantId === "string" ? await prisma.participant.findFirst({ where: { id: body.participantId, eventId: id }, select: { id: true } }) : null;
  if (!question || !participant) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const q = await prisma.parentQuestion.create({ data: { participantId: participant.id, question, options: readOptions(body.options), createdByUserId: g.user.id } });
  return NextResponse.json({ id: q.id }, { status: 201 });
}
