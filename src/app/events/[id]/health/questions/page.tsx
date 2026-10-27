"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { AskQuestionForm, QuestionRow, type Question } from "@/components/health/ParentQuestions";

// Zdraví -> "Dotazy na rodiče": every question of the event with the child's name, open ones first --
// to go through when the parents bring the children; answered with one click or a short text.
type P = { id: string; name: string; active: boolean };
const chip = (on: boolean) => "rounded-full px-3 py-1 text-[13px] " + (on ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist");

export default function ParentQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [list, setList] = useState<Question[] | null>(null);
  const [people, setPeople] = useState<P[]>([]);
  const [filter, setFilter] = useState<"open" | "answered" | "all">("open");
  const [search, setSearch] = useState("");
  const [askFor, setAskFor] = useState("");

  const load = useCallback(() => {
    fetch(`/api/events/${id}/parent-questions`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => setList([]));
  }, [id]);
  useEffect(() => {
    load();
    fetch(`/api/events/${id}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: P[]) => setPeople(rows.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "cs"))))
      .catch(() => {});
  }, [id, load]);

  const shown = useMemo(
    () =>
      (list ?? []).filter(
        (q) => (filter === "all" || (filter === "open" ? !q.answer : !!q.answer)) && (!search.trim() || q.participantName.toLowerCase().includes(search.trim().toLowerCase()))
      ),
    [list, filter, search]
  );
  const open = (list ?? []).filter((q) => !q.answer).length;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <a href={`/events/${id}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("parentQuestions.title")}</h1>
      <p className="mb-4 max-w-2xl text-[13px] text-ink-secondary">{t("parentQuestions.pageHint")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["open", "answered", "all"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={chip(filter === f)}>
            {t(`parentQuestions.filter.${f}`)}
            {f === "open" && ` (${open})`}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("participantsPage.searchPlaceholder")} className="ml-auto w-56 rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink" />
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <label className="flex max-w-md flex-col gap-1 text-[13px] text-ink-secondary">
          {t("parentQuestions.askFor")}
          <select value={askFor} onChange={(e) => setAskFor(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[14px] text-ink">
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {askFor && (
          <AskQuestionForm
            eventId={id}
            participantId={askFor}
            onAdded={() => {
              setAskFor("");
              load();
            }}
            onCancel={() => setAskFor("")}
          />
        )}
      </div>

      {!list ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("parentQuestions.noneHere")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((q) => (
            <QuestionRow key={q.id} eventId={id} q={q} showName onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
