"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { ENERGY_LEVELS, type PlanCategoryData } from "@/lib/planning";

type Activity = {
  id: string;
  name: string;
  defaultDurationMin: number;
  description: string | null;
  primaryCategoryId: string | null;
  secondaryCategoryId: string | null;
  defaultLeaderId: string | null;
  defaultLocationId: string | null;
  energyLevel: string | null;
  repeatable: boolean;
  active: boolean;
};
type ListItem = { id: string; name: string; data: PlanCategoryData | null };
type Form = Omit<Activity, "id" | "active">;

const EMPTY_FORM: Form = {
  name: "",
  defaultDurationMin: 30,
  description: "",
  primaryCategoryId: null,
  secondaryCategoryId: null,
  defaultLeaderId: null,
  defaultLocationId: null,
  energyLevel: null,
  repeatable: false,
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const labelClass = "flex flex-col gap-1 text-[12px] text-ink-secondary";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function PlanningActivitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ListItem[]>([]);
  const [leaders, setLeaders] = useState<ListItem[]>([]);
  const [locations, setLocations] = useState<ListItem[]>([]);
  const [otherEvents, setOtherEvents] = useState<{ id: string; name: string }[]>([]);
  const [copyFromEventId, setCopyFromEventId] = useState("");

  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/events/${eventId}/planning/activities?all=true`);
    if (res.ok) setActivities(await res.json());
  }

  useEffect(() => {
    load();
    const list = (kind: string) =>
      fetch(`/api/events/${eventId}/list-items?kind=${kind}`).then((r) => (r.ok ? r.json() : []));
    list("plan_category").then(setCategories);
    list("plan_leader").then(setLeaders);
    list("plan_location").then(setLocations);
    fetch("/api/events?module=planning")
      .then((r) => (r.ok ? r.json() : []))
      .then((events: { id: string; name: string }[]) => setOtherEvents(events.filter((e) => e.id !== eventId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const nameOf = (items: ListItem[], id: string | null) => items.find((i) => i.id === id)?.name;
  const colorOf = (id: string | null) => categories.find((c) => c.id === id)?.data?.color;

  function openAdd() {
    setError(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(a: Activity) {
    setError(null);
    setEditingId(a.id);
    setForm({ ...a });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      editingId ? `/api/events/${eventId}/planning/activities/${editingId}` : `/api/events/${eventId}/planning/activities`,
      { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }
    );
    setBusy(false);
    if (!res.ok) {
      setError(t("planActivities.errorSaveFailed"));
      return;
    }
    setForm(null);
    load();
  }

  async function patch(a: Activity, body: Partial<Activity>) {
    await fetch(`/api/events/${eventId}/planning/activities/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove(a: Activity) {
    if (!(await confirm({ message: t("planActivities.confirmDelete", { name: a.name }), danger: true }))) return;
    await fetch(`/api/events/${eventId}/planning/activities/${a.id}`, { method: "DELETE" });
    load();
  }

  async function runImport(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}/planning/activities/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("planActivities.errorImportFailed"));
      return;
    }
    const { added } = (await res.json()) as { added: number };
    setMessage(added > 0 ? t("planActivities.importAdded", { count: String(added) }) : t("planActivities.importNothing"));
    load();
  }

  const select = (
    key: keyof Form,
    items: ListItem[],
    label: string,
    filter: (i: ListItem) => boolean = () => true
  ) => (
    <label className={labelClass}>
      {label}
      <select
        value={(form?.[key] as string | null) ?? ""}
        onChange={(e) => setForm((f) => f && { ...f, [key]: e.target.value || null })}
        className={inputClass}
      >
        <option value="">—</option>
        {items.filter(filter).map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
  const isGroup = (group: "primary" | "secondary") => (c: ListItem) => (c.data?.group ?? "primary") === group;

  return (
    <div className="mx-auto max-w-[1000px] p-4 md:p-8">
      <a href={`/events/${eventId}/planning`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.planning")}
      </a>
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-ink">{t("planActivities.title")}</h1>
        <button onClick={openAdd} className={btnPrimary}>
          {t("planActivities.add")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 p-3">
        <button onClick={() => runImport({ source: "base" })} disabled={busy} className={btnSecondary}>
          {t("planActivities.importBase")}
        </button>
        <a href={`/events/${eventId}/planning/import`} className={btnSecondary}>
          {t("planImport.fromTable")}
        </a>
        {otherEvents.length > 0 && (
          <>
            <span className="mx-2 h-5 w-px bg-mist" aria-hidden="true" />
            <select value={copyFromEventId} onChange={(e) => setCopyFromEventId(e.target.value)} className={inputClass + " w-auto"}>
              <option value="">{t("planActivities.copyFromEventPlaceholder")}</option>
              {otherEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => runImport({ source: "event", fromEventId: copyFromEventId })}
              disabled={busy || !copyFromEventId}
              className={btnSecondary}
            >
              {t("planActivities.copyFromEvent")}
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {message && <p className="mb-3 text-[13px] text-ink-secondary">{message}</p>}

      {form && (
        <form onSubmit={save} className="mb-6 flex flex-col gap-3 rounded-lg border border-mist bg-paper-2 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <label className={labelClass}>
              {t("common.name")}
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                autoFocus
              />
            </label>
            <label className={labelClass}>
              {t("planLists.durationMin")}
              <input
                type="number"
                min={5}
                step={5}
                value={form.defaultDurationMin}
                onChange={(e) => setForm({ ...form, defaultDurationMin: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {select("primaryCategoryId", categories, t("planLists.primaryCategory"), isGroup("primary"))}
            {select("secondaryCategoryId", categories, t("planLists.secondaryCategory"), isGroup("secondary"))}
            {select("defaultLeaderId", leaders, t("planActivities.defaultLeader"))}
            {select("defaultLocationId", locations, t("planActivities.defaultLocation"))}
          </div>
          <label className={labelClass}>
            {t("planLists.description")}
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
              rows={2}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
              {t("planLists.energyLevel")}
              <select
                value={form.energyLevel ?? ""}
                onChange={(e) => setForm({ ...form, energyLevel: e.target.value || null })}
                className={inputClass + " w-auto"}
              >
                <option value="">—</option>
                {ENERGY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(`planLists.energy.${level}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
              <input type="checkbox" checked={form.repeatable} onChange={(e) => setForm({ ...form, repeatable: e.target.checked })} />
              {t("planLists.repeatable")}
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {t("common.save")}
            </button>
          </div>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("planActivities.empty")}</p>
      ) : (
        <ul className="list-none p-0">
          {activities.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-mist/60 py-2.5">
              <div className={"min-w-0 " + (a.active ? "" : "opacity-50")}>
                <div className="flex items-center gap-2 text-[14px] text-ink">
                  {colorOf(a.primaryCategoryId) && (
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(a.primaryCategoryId) }} aria-hidden="true" />
                  )}
                  <span className={a.active ? "" : "line-through"}>{a.name}</span>
                  <span className="text-[12px] text-ink-secondary">{a.defaultDurationMin} min</span>
                  {a.repeatable && <span className="text-[12px] text-ink-secondary">↻</span>}
                </div>
                <div className="text-[12px] text-ink-secondary">
                  {[
                    nameOf(categories, a.primaryCategoryId),
                    nameOf(categories, a.secondaryCategoryId),
                    nameOf(leaders, a.defaultLeaderId),
                    nameOf(locations, a.defaultLocationId),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => patch(a, { active: !a.active })} className="text-[12px] text-ink-secondary hover:text-ink">
                  {a.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                </button>
                <button onClick={() => openEdit(a)} className="text-[13px] text-ember hover:underline">
                  {t("common.edit")}
                </button>
                <button onClick={() => remove(a)} className="text-[13px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
