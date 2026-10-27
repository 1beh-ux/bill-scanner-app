"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { answerButtons } from "@/lib/parent-questions";

// "Dotazy na rodiče" (src/lib/parent-questions.ts): note a question while going through the lists, answer
// it when the parents bring the child -- one click on a predefined answer (Ano / Ne always there) or a text.
export type Question = { id: string; participantId: string; participantName: string; question: string; options: string[]; answer: string | null; answeredAt: string | null };
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const chip = (on: boolean) => "rounded-full border px-3 py-1 text-[13px] " + (on ? "border-pine bg-pine/15 text-pine" : "border-mist bg-paper-2 text-ink hover:bg-mist");

/** One question with its answer buttons; showName on the overview page (links to the child's Zdraví detail). */
export function QuestionRow({ eventId, q, showName, onChanged }: { eventId: string; q: Question; showName?: boolean; onChanged: () => void }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(!q.answer);
  const [busy, setBusy] = useState(false);
  const url = `/api/events/${eventId}/parent-questions/${q.id}`;

  async function answer(value: string | null) {
    setBusy(true);
    await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: value }) }).catch(() => null);
    setBusy(false);
    setText("");
    setEditing(!value);
    onChanged();
  }
  async function remove() {
    if (!(await confirm({ message: t("parentQuestions.confirmDelete"), danger: true }))) return;
    await fetch(url, { method: "DELETE" }).catch(() => null);
    onChanged();
  }

  return (
    <div className={"flex flex-col gap-2 rounded-lg border p-3 " + (q.answer ? "border-mist" : "border-amber-500/60 bg-amber-500/5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showName && (
            <a href={`/events/${eventId}/health/participants/${q.participantId}`} className="text-[13px] font-semibold text-ink hover:underline">
              {q.participantName}
            </a>
          )}
          <p className="whitespace-pre-line text-[14px] text-ink">{q.question}</p>
        </div>
        <button type="button" onClick={remove} className="text-[12px] text-red-600 hover:underline">
          {t("common.delete")}
        </button>
      </div>
      {q.answer && !editing ? (
        <p className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="rounded-full bg-pine/15 px-2.5 py-0.5 text-pine">{q.answer}</span>
          {q.answeredAt && <span className="text-[12px] text-ink-secondary">{new Date(q.answeredAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
          <button type="button" onClick={() => setEditing(true)} className="text-[12px] text-ember hover:underline">
            {t("parentQuestions.change")}
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {answerButtons(q.options).map((o) => (
              <button key={o} type="button" disabled={busy} onClick={() => answer(o)} className={chip(q.answer === o)}>
                {o}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) answer(text);
            }}
            className="flex flex-wrap gap-2"
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("parentQuestions.answerPlaceholder")} className={inputClass + " min-w-[12rem] flex-1"} />
            <button type="submit" disabled={busy || !text.trim()} className={btnPrimary}>
              {t("common.save")}
            </button>
            {q.answer && (
              <button type="button" onClick={() => answer(null)} className="text-[12px] text-ink-secondary hover:underline">
                {t("parentQuestions.clearAnswer")}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

/** The question form: the text + predefined answers, one per line (Ano / Ne are offered anyway). */
export function AskQuestionForm({ eventId, participantId, onAdded, onCancel }: { eventId: string; participantId: string; onAdded: () => void; onCancel: () => void }) {
  const { t } = useTranslations();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/parent-questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId, question, options }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setQuestion("");
      setOptions("");
      onAdded();
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-2 rounded-lg border border-mist bg-paper p-3">
      <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
        {t("parentQuestions.question")}
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={1000} autoFocus className={inputClass} placeholder={t("parentQuestions.questionPlaceholder")} />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
        {t("parentQuestions.options")}
        <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={3} className={inputClass} placeholder={t("parentQuestions.optionsPlaceholder")} />
        <span className="text-[11.5px]">{t("parentQuestions.optionsHint")}</span>
      </label>
      <div className="flex gap-3">
        <button type="submit" disabled={busy || !question.trim()} className={btnPrimary}>
          {t("parentQuestions.add")}
        </button>
        <button type="button" onClick={onCancel} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** A child's questions with "Zeptat se rodiče" (Zdraví detail, participant detail). */
export default function ParentQuestions({ eventId, participantId }: { eventId: string; participantId: string }) {
  const { t } = useTranslations();
  const [list, setList] = useState<Question[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    fetch(`/api/events/${eventId}/parent-questions?participantId=${participantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => setList([]));
  }, [eventId, participantId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!list) return null;
  const open = list.filter((q) => !q.answer).length;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">
          {t("parentQuestions.title")}
          {open > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-medium text-amber-700">{t("parentQuestions.openCount", { n: String(open) })}</span>}
        </h2>
        <button type="button" onClick={() => setAdding(!adding)} className="text-[13px] text-ember hover:underline">
          + {t("parentQuestions.ask")}
        </button>
      </div>
      {adding && (
        <AskQuestionForm
          eventId={eventId}
          participantId={participantId}
          onAdded={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {list.length === 0 && !adding && <p className="text-[13px] text-ink-secondary">{t("parentQuestions.none")}</p>}
      {list.map((q) => (
        <QuestionRow key={q.id} eventId={eventId} q={q} onChanged={load} />
      ))}
    </section>
  );
}

/** The list rows' small "?" -- the question form in a window, without leaving the list. */
export function AskParentButton({ eventId, participantId, participantName, onAdded }: { eventId: string; participantId: string; participantName: string; onAdded?: () => void }) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="text-ink-secondary hover:text-ember" title={t("parentQuestions.ask")} aria-label={t("parentQuestions.ask")}>
        <MessageCircleQuestion size={15} aria-hidden="true" />
      </button>
      {open && (
        // Clicks inside never reach a clickable list row behind it.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("parentQuestions.ask")}>
            <p className="mb-1 rounded-t-lg bg-paper px-3 pt-3 text-[14px] font-semibold text-ink">
              {t("parentQuestions.ask")} – {participantName}
            </p>
            <AskQuestionForm
              eventId={eventId}
              participantId={participantId}
              onAdded={() => {
                setOpen(false);
                onAdded?.();
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
