"use client";
import { AskParentButton } from "@/components/health/ParentQuestions";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import type { HealthNote } from "@/lib/health-notes";
import { calculateAge } from "@/lib/age";
import { participantListName } from "@/lib/participant-name";
import { useRouter } from "next/navigation";
import StatusUpdateButton from "@/components/mail/StatusUpdateButton";
import BulkAnswers from "@/components/participants/BulkAnswers";
import ColumnPicker from "@/components/ColumnPicker";
import { columnValue, type ColumnParticipant } from "@/lib/participant-columns";
import type { ParticipantFieldDef } from "@/lib/participant-fields";
import { useTableFilter, type FilterCol } from "@/components/TableFilter";

type EventBasic = { id: string; name: string; healthListColumns: string[] | null };

type Participant = ColumnParticipant & {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  dateOfBirth: string | null;
};

type HealthSignals = {
  incidentCount: Record<string, number>;
  resolvedCount?: Record<string, number>;
  lastIncidentAt: Record<string, string>;
  medPlanParticipantIds: string[];
  medPlans?: Record<string, { med: string; slot: string; dose: string | null; notes: string | null }[]>;
};

// A time's short mark for the list: the words' first letters, e.g. ráno -> R, po obědě -> PO, před spaním -> PS.
const slotMark = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("");

export default function EventHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [signals, setSignals] = useState<HealthSignals>({ incidentCount: {}, lastIncidentAt: {}, medPlanParticipantIds: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const router = useRouter();
  // Optional field columns ("Sloupce", Event.healthListColumns): any field except built-in/image.
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
  // Every configured health note (with its places): the "Seznam Zdraví" column + highlight badges.
  const [notes, setNotes] = useState<Record<string, HealthNote[]>>({});
  const listNotes = (pid: string) => (notes[pid] ?? []).filter((n) => n.places.includes("list"));
  const warning = (pid: string) => {
    const hot = (notes[pid] ?? []).filter((n) => n.highlight);
    return hot.length > 0 ? (
      <span title={hot.map((n) => `${n.label}: ${n.value}`).join("\n")} className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
        ⚠ {hot.map((n) => n.label).join(", ")}
      </span>
    ) : null;
  };
  const anyListNotes = Object.values(notes).some((list) => list.some((n) => n.places.includes("list")));

  async function load() {
    setLoading(true);
    const [evRes, partRes, signalsRes, notesRes, fieldsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
      fetch(`/api/events/${id}/participants/health-signals`),
      fetch(`/api/events/${id}/health-notes/values?place=all`),
      fetch(`/api/events/${id}/participant-fields`),
    ]);
    if (fieldsRes.ok) setFields(await fieldsRes.json());
    if (notesRes.ok) setNotes((await notesRes.json()).notes);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    if (signalsRes.ok) setSignals(await signalsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const searchedParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  const medSet = useMemo(() => new Set(signals.medPlanParticipantIds), [signals]);
  // "Dotazy na rodiče": how many are still open (the link's badge).
  const [openQuestions, setOpenQuestions] = useState(0);
  // ...and per child (the "Dotazy" column's pill).
  const [openBy, setOpenBy] = useState<Record<string, number>>({});
  const loadQuestionCount = useCallback(() => {
    fetch(`/api/events/${id}/parent-questions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { participantId: string; answer: string | null }[]) => {
        const open = list.filter((q) => !q.answer);
        setOpenQuestions(open.length);
        setOpenBy(open.reduce<Record<string, number>>((m, q) => ({ ...m, [q.participantId]: (m[q.participantId] ?? 0) + 1 }), {}));
      })
      .catch(() => {});
  }, [id]);
  const questionsPill = (pid: string) =>
    openBy[pid] ? (
      <a href={`/events/${id}/health/participants/${pid}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800" title={t("parentQuestions.openCount", { n: String(openBy[pid]) })}>
        ? {openBy[pid]}
      </a>
    ) : null;
  useEffect(() => {
    loadQuestionCount();
  }, [loadQuestionCount]);
  // Cases: pink = active, grey = resolved ("Vyřešeno"); a click opens the child's cases.
  const incidentPills = (pid: string, lastAt?: string) => {
    const active = signals.incidentCount[pid] ?? 0;
    const resolved = signals.resolvedCount?.[pid] ?? 0;
    if (!active && !resolved) return null;
    return (
      <a href={`/events/${id}/health/cases?participantId=${pid}${active ? "" : "&status=all"}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1">
        {active > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-red-700" title={lastAt ? t("healthPage.incidentTooltip", { date: new Date(lastAt).toLocaleString(lang === "cs" ? "cs-CZ" : "en-GB") }) : t("healthPage.incidentsActive")}>
            <span className="h-[7px] w-[7px] rounded-full bg-red-600" />
            {active}
          </span>
        )}
        {resolved > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2 py-0.5 text-ink-secondary" title={t("healthPage.incidentsResolved")}>
            ✓ {resolved}
          </span>
        )}
      </a>
    );
  };
  // Rows whose med cell is opened (a click shows the plans, another hides them).
  const [openMeds, setOpenMeds] = useState<Set<string>>(new Set());
  const toggleMeds = (pid: string) => setOpenMeds((x) => { const n = new Set(x); if (n.has(pid)) n.delete(pid); else n.add(pid); return n; });
  const medsCell = (pid: string) => {
    const plans = signals.medPlans?.[pid] ?? [];
    const marks = [...new Set(plans.map((p) => slotMark(p.slot)))];
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); toggleMeds(pid); }} className="flex flex-col items-start gap-1 text-left" aria-expanded={openMeds.has(pid)} title={t("healthPage.medsTooltip")}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
          <span className="h-[7px] w-[7px] rounded-full bg-amber-600" />
          {marks.length ? marks.join(" · ") : t("healthPage.colMeds")}
        </span>
        {openMeds.has(pid) && (
          <span className="flex flex-col gap-0.5 text-[12px] text-ink">
            {plans.map((p, i) => (
              <span key={i}>
                <strong>{p.slot}</strong>: {p.med}
                {p.dose && ` (${p.dose})`}
                {p.notes && <span className="text-ink-secondary"> · {p.notes}</span>}
              </span>
            ))}
          </span>
        )}
      </button>
    );
  };
  const columnOptions = useMemo(() => fields.filter((f) => f.kind !== "builtin" && f.fieldType !== "image"), [fields]);
  const activeColumns = useMemo(
    () => (event?.healthListColumns ?? []).map((k) => columnOptions.find((f) => f.key === k)).filter((f): f is ParticipantFieldDef => !!f),
    [event, columnOptions]
  );

  // Excel-like sorting / filtering of the columns (2026-10-29).
  const incidentState = (pid: string) =>
    (signals.incidentCount[pid] ?? 0) > 0 ? t("healthPage.incidentsActive") : (signals.resolvedCount?.[pid] ?? 0) > 0 ? t("healthPage.incidentsResolvedOnly") : "—";
  const filterCols: FilterCol<Participant>[] = [
    { key: "name", text: (p) => participantListName(p) },
    { key: "group", text: (p) => p.groupName || "—" },
    { key: "age", text: (p) => String(calculateAge(p.dateOfBirth) ?? "—"), sort: (p) => calculateAge(p.dateOfBirth) },
    { key: "incidents", text: (p) => incidentState(p.id), sort: (p) => (signals.incidentCount[p.id] ?? 0) * 1000 + (signals.resolvedCount?.[p.id] ?? 0) || null },
    { key: "meds", text: (p) => (medSet.has(p.id) ? [...new Set((signals.medPlans?.[p.id] ?? []).map((x) => slotMark(x.slot)))].join(" · ") || t("healthPage.colMeds") : "—") },
    { key: "questions", text: (p) => (openBy[p.id] ? String(openBy[p.id]) : "—"), sort: (p) => openBy[p.id] ?? null },
    { key: "notes", text: (p) => listNotes(p.id).map((n) => `${n.label}: ${n.value}`).join("; ") || "—" },
    ...activeColumns.map((f) => ({ key: `f:${f.key}`, text: (p: Participant) => columnValue(f, p) })),
  ];
  const table = useTableFilter(searchedParticipants, filterCols, `healthListFilter:${id}`, t);
  const filteredParticipants = table.rows;

  // The whole row opens the Zdraví detail; its previous/next follow this list as shown.
  function openDetail(pid: string) {
    try {
      sessionStorage.setItem(`healthOrder:${id}`, JSON.stringify(filteredParticipants.map((p) => p.id)));
    } catch {}
    router.push(`/events/${id}/health/participants/${pid}`);
  }
  const newIncident = (e: React.MouseEvent, pid: string) => {
    e.stopPropagation();
    router.push(`/events/${id}/health/participants/${pid}/incident?from=list`);
  };

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("healthPage.title")} ({participants.length})
      </h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("healthPage.intro")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("participantsPage.searchPlaceholder")}
            aria-label={t("participantsPage.searchPlaceholder")}
            className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 pr-8 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-ember"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label={t("common.cancel")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
        {table.active > 0 && (
          <button type="button" onClick={table.clear} className="text-[13px] text-ember hover:underline">
            {t("healthPage.clearFilters", { n: String(table.active) })}
          </button>
        )}
        <a href={`/events/${id}/health/cases`} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2">
          {t("healthCases.title")}
          {Object.values(signals.incidentCount).reduce((a, b) => a + b, 0) > 0 && <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[12px] font-medium text-red-700">{Object.values(signals.incidentCount).reduce((a, b) => a + b, 0)}</span>}
        </a>
        <a href={`/events/${id}/health/questions`} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2">
          {t("parentQuestions.title")}
          {openQuestions > 0 && <span className="ml-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-medium text-amber-700">{openQuestions}</span>}
        </a>
        <a
          href={`/events/${id}/health/send-summaries`}
          className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
        >
          {t("bulkSendSummaries.entryPoint")}
        </a>
        {columnOptions.length > 0 && (
          <ColumnPicker
            options={columnOptions.map((f) => ({ key: f.key, label: f.label }))}
            shown={activeColumns.map((f) => f.key)}
            labels={{
              button: t("participantsPage.columnsButton"),
              title: t("participantsPage.columnsPickerTitle"),
              dragHint: t("participantsPage.columnsDragHint"),
              notShown: t("participantsPage.columnsNotShown"),
            }}
            onSave={async (keys) => {
              await fetch(`/api/events/${id}/health-list-columns`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keys }),
              });
              await load();
            }}
          />
        )}
        <StatusUpdateButton eventId={id} />
        <BulkAnswers eventId={id} onDone={load} />
        <a href={`/events/${id}/participants`} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {t("participantsPage.manageButton")}
        </a>
      </div>

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery || table.active ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("name", t("common.name"))}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("group", t("participantsPage.colGroup"))}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("age", t("participantsPage.colAge"))}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("incidents", t("healthPage.colIncidents"))}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("meds", t("healthPage.colMeds"))}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("questions", t("healthPage.colQuestions"))}</th>
                {anyListNotes && <th className="p-2 text-[12px] font-medium text-ink-secondary">{table.header("notes", t("participantDetail.notesTitle"))}</th>}
                {activeColumns.map((f) => (
                  <th key={f.key} className="p-2 text-[12px] font-medium text-ink-secondary">{table.header(`f:${f.key}`, f.label)}</th>
                ))}
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => {
                const age = calculateAge(p.dateOfBirth);
                const lastAt = signals.lastIncidentAt[p.id];
                return (
                  <tr key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2 text-[14px] font-medium text-ink">
                      {participantListName(p)}
                      {warning(p.id)}
                      <span className="ml-1.5 inline-block align-middle">
                        <AskParentButton eventId={id} participantId={p.id} participantName={p.name} onAdded={loadQuestionCount} />
                      </span>
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px]">{incidentPills(p.id, lastAt) ?? "—"}</td>
                    <td className="p-2 text-[13px]">
                      {medSet.has(p.id) ? medsCell(p.id) : "—"}
                    </td>
                    <td className="p-2 text-[13px]">{questionsPill(p.id) ?? "—"}</td>
                    {anyListNotes && (
                      <td className="max-w-[280px] p-2 text-[12px] text-ink-secondary">
                        {listNotes(p.id).map((n) => (
                          <div key={n.key} className={"line-clamp-2 " + (n.highlight ? "text-red-700" : "")} title={n.value}>
                            <strong>{n.label}:</strong> {n.value}
                          </div>
                        ))}
                      </td>
                    )}
                    {activeColumns.map((f) => (
                      <td key={f.key} className="max-w-[220px] p-2 text-[13px] text-ink-secondary">
                        {columnValue(f, p)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-2 text-right">
                      <button onClick={(e) => newIncident(e, p.id)} className="text-[13px] text-ember hover:underline">
                        {t("participantsPage.addIncidentButton")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards (same pattern as the bills list) */}
        <div className="flex flex-col gap-2 md:hidden">
          {filteredParticipants.map((p) => {
            const age = calculateAge(p.dateOfBirth);
            return (
              <div key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer rounded-lg border border-mist bg-paper-2 p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="min-w-0 text-[14px] font-medium text-ink">
                    {participantListName(p)}
                    {warning(p.id)}
                    <span className="ml-1.5 inline-block align-middle">
                      <AskParentButton eventId={id} participantId={p.id} participantName={p.name} onAdded={loadQuestionCount} />
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 text-[12px]">
                    {incidentPills(p.id, signals.lastIncidentAt[p.id])}
                    {medSet.has(p.id) && medsCell(p.id)}
                    {questionsPill(p.id)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-secondary">
                  {p.groupName && <span>{p.groupName}</span>}
                  {age !== null && <span>{t("participantsPage.colAge")}: {age}</span>}
                </div>
                {listNotes(p.id).map((n) => (
                  <div key={n.key} className={"mt-0.5 text-[12px] " + (n.highlight ? "text-red-700" : "text-ink-secondary")}>
                    <strong>{n.label}:</strong> {n.value}
                  </div>
                ))}
                {activeColumns.length > 0 && (
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
                    {activeColumns.map((f) => (
                      <div key={f.key} className="contents">
                        <dt className="text-ink-secondary">{f.label}</dt>
                        <dd className="min-w-0 break-words text-ink">{columnValue(f, p)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-2 flex items-center justify-end">
                  <button onClick={(e) => newIncident(e, p.id)} className="text-[13px] text-ember hover:underline">
                    {t("participantsPage.addIncidentButton")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}


    </div>
  );
}
