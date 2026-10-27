"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Pencil } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

// A participant's pill plan (Zdraví detail, Léky a výdej): add, edit (✎), duplicate to another time (e.g.
// the same pill in the morning and after lunch), (de)activate, delete. Typing a med not yet in the event's
// catalogue creates it (POST .../list-items); an existing name (any case) is reused.
type Named = { id: string; name: string };
type Plan = { id: string; dose: string | null; notes: string | null; active: boolean; eventMed: Named; eventSlot: Named };
type Draft = { id: string | null; med: string; slotId: string; dose: string; notes: string };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const empty: Draft = { id: null, med: "", slotId: "", dose: "", notes: "" };

export default function MedPlansEditor({
  eventId,
  participantId,
  prefillNotes,
  onChanged,
  title = true,
}: {
  eventId: string;
  participantId: string;
  // "Převést na plán": opens the add form with this note (nonce = a new click).
  prefillNotes?: { text: string; nonce: number } | null;
  onChanged?: () => void;
  title?: boolean;
}) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [meds, setMeds] = useState<Named[]>([]);
  const [slots, setSlots] = useState<Named[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [p, m, s] = await Promise.all([
      fetch(`/api/participants/${participantId}/med-plans`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/events/${eventId}/list-items?kind=med`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/events/${eventId}/list-items?kind=slot`).then((r) => (r.ok ? r.json() : [])),
    ]);
    setPlans(p);
    setMeds(m);
    setSlots(s);
  }, [eventId, participantId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opened by the parent's button
    if (prefillNotes) setDraft({ ...empty, notes: prefillNotes.text });
  }, [prefillNotes]);

  const changed = async () => {
    await load();
    onChanged?.();
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const name = draft.med.trim();
    if (!name || !draft.slotId) return;
    setSaving(true);
    let eventMedId = meds.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id;
    if (!eventMedId) {
      const res = await fetch(`/api/events/${eventId}/list-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "med", name }) });
      if (res.ok) eventMedId = ((await res.json()) as Named).id;
    }
    if (eventMedId) {
      const body = JSON.stringify({ eventMedId, eventSlotId: draft.slotId, dose: draft.dose.trim() || (draft.id ? "" : undefined), notes: draft.notes.trim() || (draft.id ? "" : undefined) });
      await fetch(draft.id ? `/api/participants/${participantId}/med-plans/${draft.id}` : `/api/participants/${participantId}/med-plans`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    }
    setSaving(false);
    setDraft(null);
    changed();
  }

  async function toggleActive(plan: Plan) {
    await fetch(`/api/participants/${participantId}/med-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !plan.active }) });
    changed();
  }

  async function remove(planId: string) {
    if (!(await confirm({ message: t("medPlansSection.confirmRemove"), danger: true }))) return;
    await fetch(`/api/participants/${participantId}/med-plans/${planId}`, { method: "DELETE" });
    changed();
  }

  const form = draft && (
    <form onSubmit={save} className="mb-3 flex flex-col gap-2 rounded-lg border border-mist p-2">
      <p className="text-[12.5px] font-medium text-ink-secondary">{t(draft.id ? "medPlansSection.editTitle" : "medPlansSection.addButton")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" list={`med-catalog-${participantId}`} placeholder={t("medPlansSection.selectMed")} value={draft.med} onChange={(e) => setDraft({ ...draft, med: e.target.value })} className={inputClass + " flex-1"} />
        <datalist id={`med-catalog-${participantId}`}>
          {meds.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        <select value={draft.slotId} onChange={(e) => setDraft({ ...draft, slotId: e.target.value })} className={inputClass + " flex-1"}>
          <option value="">{t("medPlansSection.selectSlot")}</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="text" placeholder={t("medPlansSection.doseLabel")} value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} className={inputClass + " flex-1"} />
        <input type="text" placeholder={t("participantDetail.otherNotesLabel")} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputClass + " flex-1"} />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving || !draft.med.trim() || !draft.slotId} className={btnPrimary}>
          {t("common.save")}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {title && <h2 className="text-[16px] font-semibold text-ink">{t("medPlansSection.title")}</h2>}
        <button onClick={() => setDraft(draft && !draft.id ? null : { ...empty })} className="text-[13px] text-ember hover:underline">
          {t("medPlansSection.addButton")}
        </button>
      </div>
      {form}
      {plans.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("medPlansSection.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist/60 p-2">
              <div className={"text-[14px] " + (plan.active ? "text-ink" : "text-ink-secondary line-through")}>
                {plan.eventMed.name} · {plan.eventSlot.name}
                {plan.dose && <span className="text-ink-secondary"> · {plan.dose}</span>}
                {plan.notes && <span className="text-ink-secondary"> · {plan.notes}</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDraft({ id: plan.id, med: plan.eventMed.name, slotId: plan.eventSlot.id, dose: plan.dose ?? "", notes: plan.notes ?? "" })}
                  className="text-ink-secondary hover:text-ink"
                  title={t("medPlansSection.edit")}
                  aria-label={t("medPlansSection.edit")}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                {/* The same med at another time: the add form pre-filled, the time left to choose. */}
                <button
                  onClick={() => setDraft({ id: null, med: plan.eventMed.name, slotId: "", dose: plan.dose ?? "", notes: plan.notes ?? "" })}
                  className="text-ink-secondary hover:text-ink"
                  title={t("medPlansSection.duplicate")}
                  aria-label={t("medPlansSection.duplicate")}
                >
                  <Copy size={15} aria-hidden="true" />
                </button>
                <button onClick={() => toggleActive(plan)} className="text-[12px] text-ink-secondary hover:text-ink">
                  {plan.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                </button>
                <button onClick={() => remove(plan.id)} className="text-[13px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
