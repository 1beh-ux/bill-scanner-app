"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { AllergenList, CheckBadge, NoAccess, Qty, btn, btnPrimary, fmtDay, inputSm, send } from "@/components/kitchen/ui";
import type { Adjust, Entry, PlanData, Slot } from "./types";

// Jídelníček (docs/kitchen-planning-design.md): days × meal slots; meals dragged from the library onto a
// cell, moved between cells; each entry with headcount, portions and the allergen check. "Potvrdit den"
// snapshots the recipes; the learned multiplier is only a proposal ("Použít" / "Ignorovat").
type LibMeal = { id: string; name: string; mealType: string | null; tags: string[]; allergens: string[]; unconfirmed: string[] };

export default function KitchenPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<PlanData | null>(null);
  const [denied, setDenied] = useState(false);
  const [meals, setMeals] = useState<LibMeal[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"library" | "adjusts" | "copy" | null>("library");
  const [adding, setAdding] = useState<{ date: string; slotId: string } | null>(null);
  const [customName, setCustomName] = useState("");
  const base = `/api/events/${id}/kitchen`;

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
  }, [base]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
    fetch("/api/kitchen/meals")
      .then((r) => (r.ok ? r.json() : []))
      .then(setMeals)
      .catch(() => setMeals([]));
  }, [load]);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor));
  async function onDragEnd(e: DragEndEvent) {
    const over = e.over?.data.current as { date: string; slotId: string } | undefined;
    const drag = e.active.data.current as { mealId?: string; entryId?: string } | undefined;
    if (!over || !drag) return;
    if (drag.mealId) await send(`${base}/entries`, "POST", { date: over.date, slotItemId: over.slotId, mealId: drag.mealId });
    else if (drag.entryId) await send(`${base}/entries/${drag.entryId}`, "PATCH", { date: over.date, slotItemId: over.slotId });
    load();
  }
  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!adding || !customName.trim()) return;
    await send(`${base}/entries`, "POST", { date: adding.date, slotItemId: adding.slotId, customName });
    setAdding(null);
    setCustomName("");
    load();
  }
  async function confirmDay(date: string, reopen: boolean) {
    if (reopen && !(await confirm({ message: t("kitchen.plan.confirmReopen") }))) return;
    await send(`${base}/confirm`, "POST", { date, reopen });
    load();
  }

  const byCell = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of data?.entries ?? []) m.set(`${e.date}|${e.slotItemId}`, [...(m.get(`${e.date}|${e.slotItemId}`) ?? []), e]);
    return m;
  }, [data]);

  if (denied) return <NoAccess />;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const open = data.entries.find((e) => e.id === openId) ?? null;
  const shown = meals.filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()) || m.tags.some((x) => x.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">
            {t("kitchen.navPlan")} <span className="text-[15px] font-normal text-ink-secondary">· {data.event.name}</span>
          </h1>
          <p className="max-w-3xl text-[13px] text-ink-secondary print:hidden">{t("kitchen.plan.hint")}</p>
        </div>
        <CostCard cost={data.cost} eventId={id} />
      </div>
      {data.unverifiedDiets > 0 && (
        <a href={`/events/${id}/kitchen/diets`} className="mb-3 block rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 print:hidden">
          {t("kitchen.plan.unverifiedDiets", { n: String(data.unverifiedDiets) })}
        </a>
      )}
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        {(["library", "adjusts", "copy"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setPanel(panel === k ? null : k)} className={"rounded-full px-3 py-1 text-[13px] " + (panel === k ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist")}>
            {t(`kitchen.plan.panel.${k}`)}
          </button>
        ))}
        <button type="button" onClick={() => window.print()} className={btn}>
          {t("kitchen.print")}
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="w-28 p-1" />
                  {data.days.map((d) => {
                    const dayEntries = data.entries.filter((e) => e.date === d);
                    const drafts = dayEntries.filter((e) => e.status === "draft").length;
                    const confirmed = dayEntries.filter((e) => e.status === "confirmed").length;
                    return (
                      <th key={d} className="min-w-[11rem] border-b border-mist p-1 text-left align-bottom font-semibold text-ink">
                        {fmtDay(d, lang)}
                        <span className="ml-2 font-normal print:hidden">
                          {drafts > 0 ? (
                            <button type="button" onClick={() => confirmDay(d, false)} className="text-[12px] text-ember hover:underline">
                              {t("kitchen.plan.confirmDay")}
                            </button>
                          ) : confirmed > 0 ? (
                            <button type="button" onClick={() => confirmDay(d, true)} className="text-[12px] text-ink-secondary hover:underline">
                              {t("kitchen.plan.reopenDay")}
                            </button>
                          ) : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.slots.map((s) => (
                  <tr key={s.id}>
                    <th className="border-b border-mist/60 p-1 text-left align-top font-medium text-ink-secondary">
                      {s.name}
                      {s.time && <span className="block text-[11px] font-normal">{s.time}</span>}
                    </th>
                    {data.days.map((d) => (
                      <Cell key={d} date={d} slot={s} entries={byCell.get(`${d}|${s.id}`) ?? []} onOpen={setOpenId} onAdd={() => setAdding({ date: d, slotId: s.id })} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {adding && (
              <form onSubmit={addCustom} className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                <span className="text-[13px] text-ink-secondary">
                  {fmtDay(adding.date, lang)} · {data.slots.find((s) => s.id === adding.slotId)?.name}:
                </span>
                <input autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t("kitchen.plan.customName")} className={inputSm} />
                <button type="submit" disabled={!customName.trim()} className={btn}>
                  {t("common.save")}
                </button>
                <button type="button" onClick={() => setAdding(null)} className="text-[13px] text-ink-secondary hover:underline">
                  {t("common.cancel")}
                </button>
              </form>
            )}
          </div>

          {panel && (
            <aside className="w-full shrink-0 rounded-lg border border-mist bg-paper p-3 lg:w-80 print:hidden">
              {panel === "library" && (
                <div className="flex flex-col gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kitchen.plan.searchMeals")} className={inputSm} />
                  <p className="text-[11.5px] text-ink-secondary">{t("kitchen.plan.dragHint")}</p>
                  <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                    {shown.map((m) => (
                      <LibraryMeal key={m.id} m={m} />
                    ))}
                    {shown.length === 0 && (
                      <a href={`/events/${id}/kitchen/library`} className="text-[13px] text-ember hover:underline">
                        {t("kitchen.plan.goLibrary")}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {panel === "adjusts" && <AdjustsPanel base={base} slots={data.slots} adjusts={data.adjusts} days={data.days} onChanged={load} />}
              {panel === "copy" && <CopyPanel base={base} onChanged={load} />}
            </aside>
          )}
        </div>
      </DndContext>

      {open && <EntryDrawer base={base} eventId={id} entry={open} slots={data.slots} notes={data.notes.filter((n) => n.mealId === open.mealId)} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function Cell({ date, slot, entries, onOpen, onAdd }: { date: string; slot: Slot; entries: Entry[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${date}|${slot.id}`, data: { date, slotId: slot.id } });
  return (
    <td ref={setNodeRef} className={"group border-b border-l border-mist/60 p-1 align-top " + (isOver ? "bg-ember/10" : "")}>
      <div className="flex min-h-[3rem] flex-col gap-1">
        {entries.map((e) => (
          <EntryChip key={e.id} e={e} onOpen={() => onOpen(e.id)} />
        ))}
        <button type="button" onClick={onAdd} className="self-start text-[12px] text-ink-secondary opacity-0 hover:text-ember group-hover:opacity-100 print:hidden" aria-label="+">
          +
        </button>
      </div>
    </td>
  );
}

function EntryChip({ e, onOpen }: { e: Entry; onOpen: () => void }) {
  const { t } = useTranslations();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `entry:${e.id}`, data: { entryId: e.id } });
  const border = e.check?.level === "red" ? "border-red-600/70" : e.check?.level === "amber" ? "border-amber-500/70" : "border-mist";
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} className={"cursor-pointer rounded-md border bg-paper px-2 py-1 text-[12.5px] " + border + (isDragging ? " opacity-40" : "")}>
      <div className="flex items-start justify-between gap-1">
        <span className="font-medium text-ink">{e.name}</span>
        {e.status !== "draft" && <span className="text-[10.5px] text-pine">{t(`kitchen.status.${e.status}`)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-secondary">
        <span title={t("kitchen.plan.portionsTitle")}>
          {e.headcount.eaters} {t("kitchen.plan.people")} · {e.portions.toLocaleString("cs-CZ")} {t("kitchen.plan.portionsShort")}
        </span>
        {e.check && e.check.level !== "ok" && <CheckBadge level={e.check.level} />}
        {e.proposal && <span className="rounded-full bg-ember/15 px-1.5 text-ember">×{e.proposal.multiplier}</span>}
        {e.check?.specialPortions.some((s) => s.applied) && <span>★ {e.check.specialPortions.filter((s) => s.applied).reduce((s, x) => s + x.names.length, 0)}</span>}
      </div>
    </div>
  );
}

function LibraryMeal({ m }: { m: LibMeal }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `meal:${m.id}`, data: { mealId: m.id } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={"cursor-grab rounded-md border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink " + (isDragging ? "opacity-40" : "")}>
      {m.name}
      <span className="ml-2 text-[11px] text-ink-secondary">
        {m.mealType}
        {m.allergens.length > 0 && (
          <>
            {" · "}
            <AllergenList codes={m.allergens} />
          </>
        )}
        {m.unconfirmed.length > 0 && " · ?"}
      </span>
    </div>
  );
}

function CostCard({ cost, eventId }: { cost: PlanData["cost"]; eventId: string }) {
  const { t } = useTranslations();
  return (
    <div className="rounded-lg border border-mist bg-paper px-3 py-2 text-[13px]">
      <div className="font-medium text-ink">{t("kitchen.cost.title")}</div>
      {cost.foodSet ? (
        <div className="text-ink-secondary">
          <span className="text-[18px] font-semibold text-ink">{cost.perPersonDay == null ? "—" : `${cost.perPersonDay.toLocaleString("cs-CZ")} Kč`}</span>
          <span className="ml-2">{t("kitchen.cost.detail", { spent: Math.round(cost.spent).toLocaleString("cs-CZ"), days: String(cost.personDays) })}</span>
          {cost.budget > 0 && <div className="text-[12px]">{t("kitchen.cost.budget", { budget: Math.round(cost.budget).toLocaleString("cs-CZ"), perDay: cost.personDays ? Math.round(cost.budget / cost.personDays).toLocaleString("cs-CZ") : "—" })}</div>}
        </div>
      ) : (
        <a href={`/events/${eventId}?tab=kuchyne`} className="text-[12px] text-ember hover:underline">
          {t("kitchen.cost.setup")}
        </a>
      )}
    </div>
  );
}

function AdjustsPanel({ base, slots, adjusts, days, onChanged }: { base: string; slots: Slot[]; adjusts: Adjust[]; days: string[]; onChanged: () => void }) {
  const { t, lang } = useTranslations();
  const [d, setD] = useState({ dateFrom: days[0] ?? "", dateTo: days[0] ?? "", slotItemId: "", count: "", factor: "1", label: "" });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await send(`${base}/adjusts`, "POST", { ...d, count: Number(d.count), factor: Number(d.factor.replace(",", ".")) });
    if (res?.ok) setD({ ...d, count: "", label: "" });
    onChanged();
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold text-ink">{t("kitchen.adjust.title")}</h3>
      <p className="text-[11.5px] text-ink-secondary">{t("kitchen.adjust.hint")}</p>
      {adjusts.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-[13px]">
          <span>
            <b className="tabular-nums">{a.count > 0 ? `+${a.count}` : a.count}</b> {a.label}
            <span className="block text-[11px] text-ink-secondary">
              {fmtDay(a.dateFrom, lang)}
              {a.dateTo !== a.dateFrom && ` – ${fmtDay(a.dateTo, lang)}`} · {slots.find((s) => s.id === a.slotItemId)?.name ?? t("kitchen.adjust.allSlots")}
              {a.factor !== 1 && ` · ×${a.factor}`}
            </span>
          </span>
          <button type="button" onClick={async () => { await send(`${base}/adjusts?adjustId=${a.id}`, "DELETE"); onChanged(); }} className="text-[12px] text-red-600 hover:underline">
            {t("common.delete")}
          </button>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-1.5 border-t border-mist pt-2">
        <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder={t("kitchen.adjust.label")} className={inputSm} />
        <div className="flex gap-1.5">
          <input type="number" value={d.count} onChange={(e) => setD({ ...d, count: e.target.value })} placeholder={t("kitchen.adjust.count")} className={inputSm + " w-24"} />
          <input value={d.factor} onChange={(e) => setD({ ...d, factor: e.target.value })} title={t("kitchen.adjust.factor")} className={inputSm + " w-16"} />
        </div>
        <div className="flex gap-1.5">
          <input type="date" value={d.dateFrom} onChange={(e) => setD({ ...d, dateFrom: e.target.value, dateTo: d.dateTo < e.target.value ? e.target.value : d.dateTo })} className={inputSm} />
          <input type="date" value={d.dateTo} onChange={(e) => setD({ ...d, dateTo: e.target.value })} className={inputSm} />
        </div>
        <select value={d.slotItemId} onChange={(e) => setD({ ...d, slotItemId: e.target.value })} className={inputSm}>
          <option value="">{t("kitchen.adjust.allSlots")}</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!d.label.trim() || !Number(d.count)} className={btn}>
          + {t("kitchen.adjust.add")}
        </button>
      </form>
      <Absences base={base} slots={slots} days={days} />
    </div>
  );
}

function Absences({ base, slots, days }: { base: string; slots: Slot[]; days: string[] }) {
  const { t, lang } = useTranslations();
  type Row = { id: string; date: string; slotItemId: string | null; slotName: string | null; name: string; reason: string | null };
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<{ value: string; name: string }[]>([]);
  const [d, setD] = useState({ person: "", date: days[0] ?? "", slotItemId: "", reason: "" });
  const load = useCallback(() => {
    fetch(`${base}/absences`).then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([]));
  }, [base]);
  useEffect(() => {
    load();
    fetch(`${base}/diets`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && setPeople([...x.participants.map((p: { participantId: string; name: string }) => ({ value: `p:${p.participantId}`, name: p.name })), ...x.adults.map((a: { id: string; name: string }) => ({ value: `a:${a.id}`, name: a.name }))].sort((a, b) => a.name.localeCompare(b.name, "cs"))))
      .catch(() => null);
  }, [base, load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const [kind, pid] = d.person.split(":");
    await send(`${base}/absences`, "POST", { [kind === "p" ? "participantId" : "eventPersonId"]: pid, date: d.date, slotItemId: d.slotItemId || null, reason: d.reason });
    setD({ ...d, person: "", reason: "" });
    load();
  }
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-mist pt-2">
      <h3 className="text-[14px] font-semibold text-ink">{t("kitchen.absence.title")}</h3>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 text-[13px]">
          <span>
            {r.name} <span className="text-[11px] text-ink-secondary">· {fmtDay(r.date, lang)} · {r.slotName ?? t("kitchen.absence.wholeDay")}{r.reason && ` · ${r.reason}`}</span>
          </span>
          <button type="button" onClick={async () => { await send(`${base}/absences?absenceId=${r.id}`, "DELETE"); load(); }} className="text-[12px] text-red-600 hover:underline">
            {t("common.delete")}
          </button>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-1.5">
        <select value={d.person} onChange={(e) => setD({ ...d, person: e.target.value })} className={inputSm}>
          <option value="">{t("kitchen.absence.person")}</option>
          {people.map((p) => (
            <option key={p.value} value={p.value}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} className={inputSm} />
          <select value={d.slotItemId} onChange={(e) => setD({ ...d, slotItemId: e.target.value })} className={inputSm}>
            <option value="">{t("kitchen.absence.wholeDay")}</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <input value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder={t("kitchen.absence.reason")} className={inputSm} />
        <button type="submit" disabled={!d.person || !d.date} className={btn}>
          + {t("kitchen.absence.add")}
        </button>
      </form>
    </div>
  );
}

function CopyPanel({ base, onChanged }: { base: string; onChanged: () => void }) {
  const { t, lang } = useTranslations();
  const confirm = useConfirm();
  const [events, setEvents] = useState<{ id: string; name: string; startDate: string; entries: number }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${base}/copy`).then((r) => (r.ok ? r.json() : [])).then(setEvents).catch(() => setEvents([]));
  }, [base]);
  async function copy(ev: { id: string; name: string }) {
    if (!(await confirm({ message: t("kitchen.copy.confirm", { name: ev.name }) }))) return;
    const res = await send(`${base}/copy`, "POST", { fromEventId: ev.id });
    const d = res?.ok ? await res.json() : null;
    setMsg(d ? t("kitchen.copy.done", { copied: String(d.copied), skipped: String(d.skipped) }) : t("kitchen.failed"));
    onChanged();
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold text-ink">{t("kitchen.plan.panel.copy")}</h3>
      <p className="text-[11.5px] text-ink-secondary">{t("kitchen.copy.hint")}</p>
      {events?.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.copy.none")}</p>}
      {events?.map((ev) => (
        <button key={ev.id} type="button" onClick={() => copy(ev)} className="rounded-md border border-mist px-2 py-1 text-left text-[13px] hover:bg-paper-2">
          {ev.name}
          <span className="block text-[11px] text-ink-secondary">
            {new Date(ev.startDate).toLocaleDateString(lang === "en" ? "en-GB" : "cs-CZ")} · {ev.entries} {t("kitchen.copy.entries")}
          </span>
        </button>
      ))}
      {msg && <p className="text-[13px] text-ink">{msg}</p>}
    </div>
  );
}

function EntryDrawer({ base, eventId, entry: e, slots, notes, onClose, onChanged }: { base: string; eventId: string; entry: Entry; slots: Slot[]; notes: PlanData["notes"]; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useTranslations();
  const confirm = useConfirm();
  const [ignored, setIgnored] = useState(false);
  const [noteText, setNoteText] = useState("");
  const draft = e.status === "draft";
  const url = `${base}/entries/${e.id}`;
  const patch = async (body: Record<string, unknown>) => {
    await send(url, "PATCH", body);
    onChanged();
  };
  async function remove() {
    if (!(await confirm({ message: t("kitchen.plan.confirmDelete", { name: e.name }), danger: true }))) return;
    await send(url, "DELETE");
    onClose();
    onChanged();
  }
  async function addNote(ev: React.FormEvent) {
    ev.preventDefault();
    if (!noteText.trim() || !e.mealId) return;
    await send(`${base}/notes`, "POST", { mealId: e.mealId, body: noteText });
    setNoteText("");
    onChanged();
  }
  const c = e.check;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-4 shadow-xl" onClick={(x) => x.stopPropagation()} role="dialog" aria-label={e.name}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">{e.name}</h2>
            <p className="text-[12.5px] text-ink-secondary">
              {fmtDay(e.date, lang)} · {slots.find((s) => s.id === e.slotItemId)?.name} · {t(`kitchen.status.${e.status}`)}
              {e.fromSnapshot && ` · ${t("kitchen.plan.snapshot")}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>
        {e.archived && <p className="mb-2 text-[12.5px] text-amber-700">{t("kitchen.plan.archivedMeal")}</p>}

        <section className="mb-3 rounded-lg border border-mist p-2 text-[13px]">
          <div className="font-medium text-ink">{t("kitchen.plan.headcount")}</div>
          <p className="text-ink-secondary">{t("kitchen.plan.headcountDetail", { participants: String(e.headcount.participants), adults: String(e.headcount.adults), extra: String(e.headcount.extra), portions: e.headcount.portions.toLocaleString("cs-CZ") })}</p>
          {e.headcount.missingDob > 0 && <p className="text-amber-700">{t("kitchen.plan.missingDob", { n: String(e.headcount.missingDob) })}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="radio" disabled={!draft} checked={e.headcountMode === "auto"} onChange={() => patch({ headcountMode: "auto" })} /> {t("kitchen.plan.modeAuto")}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" disabled={!draft} checked={e.headcountMode === "manual"} onChange={() => patch({ headcountMode: "manual", manualPortions: e.manualPortions ?? e.headcount.portions })} /> {t("kitchen.plan.modeManual")}
            </label>
            {e.headcountMode === "manual" && <input type="number" step="0.5" min={0} disabled={!draft} defaultValue={e.manualPortions ?? ""} onBlur={(x) => patch({ manualPortions: x.target.value === "" ? null : Number(x.target.value) })} className={inputSm + " w-24"} />}
          </div>
        </section>

        {/* The learned multiplier: a proposal with its evidence, applied only by "Použít". */}
        <section className="mb-3 rounded-lg border border-mist p-2 text-[13px]">
          <div className="font-medium text-ink">{t("kitchen.plan.sizing")}</div>
          <p className="text-ink-secondary">{e.multiplier == null ? t("kitchen.plan.noMultiplier") : t("kitchen.plan.multiplier", { m: String(e.multiplier) })}</p>
          {e.proposal && !ignored && draft && (
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-ember/10 p-2">
              <span>{t("kitchen.plan.proposal", { m: String(e.proposal.multiplier), samples: String(e.proposal.samples), events: String(e.proposal.events) })}</span>
              <button type="button" onClick={() => patch({ sizingMultiplier: e.proposal!.multiplier })} className={btn}>
                {t("kitchen.plan.use")}
              </button>
              <button type="button" onClick={() => setIgnored(true)} className="text-[12px] text-ink-secondary hover:underline">
                {t("kitchen.plan.ignore")}
              </button>
            </div>
          )}
          {e.multiplier != null && draft && (
            <button type="button" onClick={() => patch({ sizingMultiplier: null })} className="mt-1 text-[12px] text-ink-secondary hover:underline">
              {t("kitchen.plan.resetMultiplier")}
            </button>
          )}
        </section>

        {c && (
          <section className="mb-3 rounded-lg border border-mist p-2 text-[13px]">
            <div className="flex items-center gap-2 font-medium text-ink">
              {t("kitchen.plan.allergens")} <CheckBadge level={c.level} />
            </div>
            <p className="text-ink-secondary">
              <AllergenList codes={c.allergens} empty={t("kitchen.plan.noAllergens")} />
            </p>
            {c.unconfirmedIngredients.length > 0 && <p className="text-amber-700">{t("kitchen.plan.unconfirmedIngredients", { names: c.unconfirmedIngredients.join(", ") })}</p>}
            {c.unverifiedPeople > 0 && (
              <a href={`/events/${eventId}/kitchen/diets`} className="block text-amber-700 hover:underline">
                {t("kitchen.plan.unverifiedPeople", { n: String(c.unverifiedPeople) })}
              </a>
            )}
            {c.conflicts.map((x) => (
              <p key={x.key} className={!x.variantId || !e.variantIds.includes(x.variantId) ? "text-red-700" : "text-ink"}>
                {x.name}: <AllergenList codes={x.allergens} />
                {x.diets.length > 0 && ` ${x.diets.map((d) => t(`kitchen.diet.${d}`)).join(", ")}`}
                {" → "}
                {x.variantId ? e.variants.find((v) => v.id === x.variantId)?.name : t("kitchen.plan.noSafeVariant")}
              </p>
            ))}
            {e.variants.length > 0 && (
              <div className="mt-1 flex flex-col gap-1">
                <span className="text-[12px] text-ink-secondary">{t("kitchen.plan.variants")}</span>
                {e.variants.map((v) => {
                  const sp = c.specialPortions.find((s) => s.variantId === v.id);
                  return (
                    <label key={v.id} className="flex items-center gap-1.5">
                      <input type="checkbox" disabled={!draft} checked={e.variantIds.includes(v.id)} onChange={(x) => patch({ variantIds: x.target.checked ? [...e.variantIds, v.id] : e.variantIds.filter((y) => y !== v.id) })} />
                      {v.name}
                      {sp && <span className="text-[12px] text-ink-secondary">({sp.names.length}: {sp.names.join(", ")})</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mb-3 rounded-lg border border-mist p-2 text-[13px]">
          <div className="font-medium text-ink">
            {t("kitchen.plan.quantities", { portions: e.sheet.portions.toLocaleString("cs-CZ") })}
          </div>
          <table className="w-full">
            <tbody>
              {e.sheet.lines.map((l) => (
                <tr key={l.ingredientId}>
                  <td className="py-0.5">{l.name}</td>
                  <td className="py-0.5 text-right">
                    <Qty q={l.qty} unit={l.unit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.sheet.lines.length === 0 && <p className="text-ink-secondary">—</p>}
        </section>

        <section className="mb-3 flex flex-col gap-2 text-[13px]">
          <label className="flex items-center gap-2">
            {t("kitchen.plan.servingTime")}
            <input type="time" defaultValue={e.servingTime ?? ""} onBlur={(x) => patch({ servingTime: x.target.value || null })} className={inputSm} />
          </label>
          <label className="flex flex-col gap-1">
            {t("kitchen.plan.note")}
            <textarea defaultValue={e.note ?? ""} rows={2} onBlur={(x) => x.target.value !== (e.note ?? "") && patch({ note: x.target.value })} className={inputSm} />
          </label>
        </section>

        {e.mealId && (
          <section className="mb-3 flex flex-col gap-1 text-[13px]">
            <div className="font-medium text-ink">{t("kitchen.notes.title")}</div>
            {notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2 rounded-md bg-paper-2 px-2 py-1">
                <span className="whitespace-pre-line">{n.body}{n.eventId == null && <span className="ml-1 text-[11px] text-ink-secondary">({t("kitchen.notes.library")})</span>}</span>
                {n.eventId && (
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={async () => { await send(`${base}/notes`, "PATCH", { noteId: n.id, toLibrary: true }); onChanged(); }} className="text-[11.5px] text-ember hover:underline">
                      {t("kitchen.notes.toLibrary")}
                    </button>
                    <button type="button" onClick={async () => { await send(`${base}/notes?noteId=${n.id}`, "DELETE"); onChanged(); }} className="text-[11.5px] text-red-600 hover:underline">
                      {t("common.delete")}
                    </button>
                  </span>
                )}
              </div>
            ))}
            <form onSubmit={addNote} className="flex gap-2">
              <input value={noteText} onChange={(x) => setNoteText(x.target.value)} placeholder={t("kitchen.notes.placeholder")} className={inputSm + " flex-1"} />
              <button type="submit" disabled={!noteText.trim()} className={btn}>
                {t("common.save")}
              </button>
            </form>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <a href={`/events/${eventId}/kitchen/today?date=${e.date}`} className={btnPrimary}>
            {t("kitchen.plan.cookSheet")}
          </a>
          <button type="button" onClick={remove} className="text-[13px] text-red-600 hover:underline">
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
