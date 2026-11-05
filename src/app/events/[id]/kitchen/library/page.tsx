"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { AllergenPicker } from "@/components/adults/AdultForm";
import MealEditor, { emptyDraft, type Ingredient, type MealDraft } from "@/components/kitchen/MealEditor";
import { AllergenList, NoAccess, btn, btnPrimary, inputSm, send } from "@/components/kitchen/ui";
import { CONTENT_FLAGS } from "@/lib/kitchen/allergens";
import { useDiets } from "@/components/kitchen/useDiets";

// Knihovna (the organization's): Jídla, Suroviny and "Importovat recepty" (AI). Org-owned -- every event of
// the organization plans from it; access: a Kuchyně grant on any of its events (or an org admin).
type MealRow = { id: string; name: string; mealType: string | null; tags: string[]; ingredients: number; variants: { id: string; name: string }[]; uses: number; allergens: string[]; unconfirmed: string[]; archivedAt: string | null; parentMealId: string | null };
type IngredientRow = Ingredient & { storeHint: string | null; category: string | null; packSize: number | null; packUnit: string | null; shelfLifeDays: number | null; uses: number };
// The diets an ingredient may be marked fine for ("ok:<code>": lactose-free milk for "bez laktózy").
const DietOkPicker = ({ flags, onChange }: { flags: string[]; onChange: (f: string[]) => void }) => {
  const { t } = useTranslations();
  const { diets } = useDiets();
  const relevant = diets.filter((d) => d.allergens.length || d.contents.length);
  if (!relevant.length) return null;
  return (
    <div className="flex flex-wrap gap-3 text-[13px] text-ink">
      <span className="text-ink-secondary">{t("kitchen.ingredient.okFor")}</span>
      {relevant.map((d) => (
        <label key={d.code} className="flex items-center gap-1.5">
          <input type="checkbox" checked={flags.includes(`ok:${d.code}`)} onChange={(e) => onChange(e.target.checked ? [...flags, `ok:${d.code}`] : flags.filter((x) => x !== `ok:${d.code}`))} />
          {d.name}
        </label>
      ))}
    </div>
  );
};

export default function KitchenLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [tab, setTab] = useState<"meals" | "ingredients" | "import">("meals");
  const [meals, setMeals] = useState<MealRow[] | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [archived, setArchived] = useState(false);
  const [denied, setDenied] = useState(false);
  const [openMeal, setOpenMeal] = useState<string | "new" | null>(null);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([fetch(`/api/kitchen/meals${archived ? "?archived=1" : ""}`, { cache: "no-store" }), fetch("/api/kitchen/ingredients?all=1", { cache: "no-store" })]).catch(() => [null, null]);
    if (m?.status === 403 || m?.status === 401) return setDenied(true);
    if (m?.ok) setMeals(await m.json());
    if (i?.ok) setIngredients(await i.json());
  }, [archived]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  if (denied) return <NoAccess />;
  if (!meals) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("kitchen.navLibrary")}</h1>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-secondary">{t("kitchen.library.hint")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["meals", "ingredients", "import"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setTab(k); setOpenMeal(null); }} className={"rounded-full px-3 py-1 text-[13px] " + (tab === k ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist")}>
            {t(`kitchen.library.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === "meals" &&
        (openMeal ? (
          <MealDetail mealId={openMeal} ingredients={ingredients} onClose={() => { setOpenMeal(null); load(); }} onOpen={setOpenMeal} onSaved={load} />
        ) : (
          <MealList meals={meals} archived={archived} setArchived={setArchived} onOpen={setOpenMeal} />
        ))}
      {tab === "ingredients" && <Ingredients rows={ingredients} onChanged={load} />}
      {tab === "import" && <ImportRecipes eventId={id} ingredients={ingredients} onSaved={load} />}
    </div>
  );
}

function MealList({ meals, archived, setArchived, onOpen }: { meals: MealRow[]; archived: boolean; setArchived: (v: boolean) => void; onOpen: (id: string) => void }) {
  const { t } = useTranslations();
  const [q, setQ] = useState("");
  const shown = meals.filter((m) => !q.trim() || `${m.name} ${m.tags.join(" ")} ${m.mealType ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onOpen("new")} className={btnPrimary}>
          + {t("kitchen.library.newMeal")}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kitchen.library.search")} className={inputSm + " min-w-[14rem]"} />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("kitchen.library.showArchived")}
        </label>
      </div>
      {shown.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.library.noMeals")}</p>}
      <div className="flex flex-col divide-y divide-mist/60 rounded-lg border border-mist">
        {shown.map((m) => (
          <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-paper-2">
            <span>
              <span className="text-[14px] font-medium text-ink">{m.name}</span>
              <span className="ml-2 text-[12px] text-ink-secondary">
                {[m.mealType, ...m.tags].filter(Boolean).join(" · ")}
                {m.variants.length > 0 && ` · ${m.variants.map((v) => v.name).join(", ")}`}
              </span>
            </span>
            <span className="flex items-center gap-3 text-[12px] text-ink-secondary">
              <span>
                {t("kitchen.meal.allergens")}: <AllergenList codes={m.allergens} empty="—" />
              </span>
              {m.unconfirmed.length > 0 && <span className="text-amber-700">{t("kitchen.unverified")}</span>}
              <span>{t("kitchen.library.uses", { n: String(m.uses) })}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type MealFull = {
  id: string;
  name: string;
  mealType: string | null;
  tags: string[];
  steps: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  equipment: string | null;
  prepAheadOk: boolean;
  leftoverFriendly: boolean;
  coldPackable: boolean;
  archivedAt: string | null;
  parentMeal: { id: string; name: string } | null;
  ingredients: { ingredientId: string; qtyPerAdultPortion: number; optional: boolean; note: string | null; ingredient: Ingredient }[];
  variants: { id: string; name: string; clearsAllergens: string[]; swaps: { fromIngredientId: string; toIngredientId: string; qtyPerAdultPortion?: number | null }[] }[];
  notes: { id: string; body: string; eventId: string | null; eventName: string | null; pinned: boolean; createdAt: string }[];
  history: { id: string; eventId: string; eventName: string; date: string; slot: string; status: string; feedback: { verdict: string; leftoverPercent: number | null; shortPercent: number | null; stars: number | null; note: string | null } | null }[];
  learned: { multiplier: number; samples: number; events: number };
};

const toDraft = (m: MealFull, ingredients: Ingredient[]): MealDraft => ({
  name: m.name,
  mealType: m.mealType ?? "",
  tags: m.tags.join(", "),
  steps: m.steps ?? "",
  prepMinutes: m.prepMinutes?.toString() ?? "",
  cookMinutes: m.cookMinutes?.toString() ?? "",
  equipment: m.equipment ?? "",
  prepAheadOk: m.prepAheadOk,
  leftoverFriendly: m.leftoverFriendly,
  coldPackable: m.coldPackable,
  // 0 = "dle potřeby" (shown empty).
  lines: m.ingredients.map((l) => ({ ingredientId: l.ingredientId, name: l.ingredient.name, unit: l.ingredient.unit, qty: l.qtyPerAdultPortion ? String(l.qtyPerAdultPortion) : "", optional: l.optional, note: l.note ?? "", allergens: [] })),
  variants: m.variants.map((v) => ({
    name: v.name,
    clearsAllergens: v.clearsAllergens,
    swaps: v.swaps.map((s) => ({ fromLine: m.ingredients.findIndex((l) => l.ingredientId === s.fromIngredientId), toName: ingredients.find((i) => i.id === s.toIngredientId)?.name ?? "", qty: s.qtyPerAdultPortion == null ? "" : String(s.qtyPerAdultPortion) })),
  })),
});

function MealDetail({ mealId, ingredients, onClose, onOpen, onSaved }: { mealId: string; ingredients: Ingredient[]; onClose: () => void; onOpen: (id: string) => void; onSaved: () => Promise<void> }) {
  const { t, lang } = useTranslations();
  const confirm = useConfirm();
  const [m, setM] = useState<MealFull | null>(null);
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState("");
  const url = `/api/kitchen/meals/${mealId}`;
  const load = useCallback(async () => {
    if (mealId === "new") return;
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setM(await r.json());
  }, [url, mealId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  async function save(body: Record<string, unknown>) {
    const res = await send(mealId === "new" ? "/api/kitchen/meals" : url, mealId === "new" ? "POST" : "PATCH", body);
    if (!res?.ok) return (await res?.json().catch(() => null))?.error ?? "failed";
    // K3 (audit2): new inline ingredients exist only after the save -- reload the page's ingredient list
    // (Suroviny tab, the editor's allergen line) before the editor redraws, so nothing shows a pre-save state.
    const created = mealId === "new" ? (await res.json()).id : null;
    await onSaved();
    if (created) onOpen(created);
    else {
      await load();
      setVersion((v) => v + 1);
    }
    return null;
  }
  async function fork() {
    const res = await send(`${url}/fork`, "POST", {});
    if (res?.ok) onOpen((await res.json()).id);
  }
  async function archive(on: boolean) {
    await send(url, "PATCH", { archived: on });
    load();
  }
  async function remove() {
    if (!(await confirm({ message: t("kitchen.library.confirmDelete", { name: m?.name ?? "" }), danger: true }))) return;
    const res = await send(url, "DELETE");
    if (res?.status === 409) {
      if (await confirm({ message: t("kitchen.library.inUseArchive") })) await archive(true);
      return;
    }
    onClose();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await send(`${url}/notes`, "POST", { body: note });
    setNote("");
    load();
  }

  if (mealId !== "new" && !m) return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="text-[13px] text-ember hover:underline">
          ← {t("kitchen.library.back")}
        </button>
        {m && (
          <>
            <button type="button" onClick={fork} className={btn}>
              {t("kitchen.library.fork")}
            </button>
            <button type="button" onClick={() => archive(!m.archivedAt)} className={btn}>
              {m.archivedAt ? t("kitchen.library.unarchive") : t("kitchen.library.archive")}
            </button>
            <button type="button" onClick={remove} className="text-[13px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
          </>
        )}
      </div>
      {m?.parentMeal && (
        <p className="text-[12.5px] text-ink-secondary">
          {t("kitchen.library.forkOf")}{" "}
          <button type="button" onClick={() => onOpen(m.parentMeal!.id)} className="text-ember hover:underline">
            {m.parentMeal.name}
          </button>
        </p>
      )}
      <MealEditor key={`${mealId}-${version}`} initial={m ? toDraft(m, ingredients) : emptyDraft()} ingredients={ingredients} onSave={save} onCancel={onClose} banner={m ? <p className="text-[12px] text-ink-secondary">{t("kitchen.library.snapshotHint")}</p> : null} />
      {m && (
        <>
          <section className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold text-ink">{t("kitchen.notes.title")}</h3>
            {m.notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2 rounded-md bg-paper-2 px-2 py-1 text-[13px]">
                <span className="whitespace-pre-line">
                  {n.body}
                  <span className="ml-1 text-[11px] text-ink-secondary">({n.eventName ?? t("kitchen.notes.library")})</span>
                </span>
                <button type="button" onClick={async () => { await send(`${url}/notes?noteId=${n.id}`, "DELETE"); load(); }} className="text-[11.5px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            ))}
            <form onSubmit={addNote} className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("kitchen.notes.placeholder")} className={inputSm + " flex-1"} />
              <button type="submit" disabled={!note.trim()} className={btn}>
                {t("common.save")}
              </button>
            </form>
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold text-ink">{t("kitchen.library.history")}</h3>
            <p className="text-[12.5px] text-ink-secondary">
              {m.learned.samples ? t("kitchen.library.learned", { m: String(m.learned.multiplier), samples: String(m.learned.samples), events: String(m.learned.events) }) : t("kitchen.library.noFeedback")}
            </p>
            {m.history.map((h) => (
              <div key={h.id} className="text-[13px] text-ink">
                {new Date(`${h.date}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "cs-CZ", { timeZone: "UTC" })} · {h.eventName} · {h.slot}
                {h.feedback && (
                  <span className="ml-2 text-ink-secondary">
                    {t(`kitchen.feedback.${h.feedback.verdict}`)}
                    {h.feedback.leftoverPercent != null && ` ${h.feedback.leftoverPercent} %`}
                    {h.feedback.shortPercent != null && ` ${h.feedback.shortPercent} %`}
                    {h.feedback.stars != null && ` · ${"★".repeat(h.feedback.stars)}`}
                    {h.feedback.note && ` · ${h.feedback.note}`}
                  </span>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Ingredients({ rows, onChanged }: { rows: IngredientRow[]; onChanged: () => void }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<IngredientRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function save(confirmAllergens: boolean) {
    if (!edit?.name?.trim()) return;
    const body = { ...edit, ...(confirmAllergens ? { allergensConfirmed: true } : {}) };
    delete (body as { uses?: number }).uses;
    const res = await send(edit.id ? `/api/kitchen/ingredients/${edit.id}` : "/api/kitchen/ingredients", edit.id ? "PATCH" : "POST", body);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "failed");
    setError(null);
    setEdit(null);
    onChanged();
  }
  async function remove(r: IngredientRow) {
    if (!(await confirm({ message: t(r.uses ? "kitchen.ingredient.confirmDeactivate" : "kitchen.ingredient.confirmDelete", { name: r.name }), danger: true }))) return;
    await send(`/api/kitchen/ingredients/${r.id}`, "DELETE");
    onChanged();
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setEdit({ name: "", unit: "g", allergens: [], dietFlags: [] })} className={btnPrimary}>
          + {t("kitchen.ingredient.new")}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kitchen.library.search")} className={inputSm + " min-w-[14rem]"} />
      </div>
      {edit && (
        <div className="flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[13px] text-ink-secondary sm:col-span-2">
              {t("kitchen.ingredient.name")}
              <input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputSm} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
              {t("kitchen.ingredient.unit")}
              <select value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as Ingredient["unit"] })} className={inputSm}>
                {(["g", "ml", "ks"] as const).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
              {t("kitchen.ingredient.storeHint")}
              <input value={edit.storeHint ?? ""} onChange={(e) => setEdit({ ...edit, storeHint: e.target.value })} className={inputSm} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
              {t("kitchen.ingredient.category")}
              <input value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={inputSm} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
              {t("kitchen.ingredient.shelfLife")}
              <input value={edit.shelfLifeDays ?? ""} onChange={(e) => setEdit({ ...edit, shelfLifeDays: e.target.value === "" ? null : Number(e.target.value) })} inputMode="numeric" className={inputSm} />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-ink-secondary">
              {t("kitchen.ingredient.allergens")}
              {edit.id && !edit.allergensConfirmed && <span className="ml-2 text-amber-700">{t("kitchen.unverified")}</span>}
            </span>
            <AllergenPicker value={edit.allergens ?? []} onChange={(v) => setEdit({ ...edit, allergens: v })} />
          </div>
          <div className="flex flex-wrap gap-3 text-[13px] text-ink">
            <span className="text-ink-secondary">{t("kitchen.ingredient.contains")}</span>
            {CONTENT_FLAGS.map((f) => (
              <label key={f} className="flex items-center gap-1.5">
                <input type="checkbox" checked={(edit.dietFlags ?? []).includes(f)} onChange={(e) => setEdit({ ...edit, dietFlags: e.target.checked ? [...(edit.dietFlags ?? []), f] : (edit.dietFlags ?? []).filter((x) => x !== f) })} />
                {t(`kitchen.content.${f}`)}
              </label>
            ))}
          </div>
          <DietOkPicker flags={edit.dietFlags ?? []} onChange={(f) => setEdit({ ...edit, dietFlags: f })} />
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={!!edit.pantry} onChange={(e) => setEdit({ ...edit, pantry: e.target.checked })} />
            {t("kitchen.ingredient.pantry")}
            <span className="text-[12px] text-ink-secondary">{t("kitchen.ingredient.pantryHint")}</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-secondary">
            {t("kitchen.ingredient.altUnit")}
            <input value={edit.altUnitName ?? ""} onChange={(e) => setEdit({ ...edit, altUnitName: e.target.value })} placeholder={t("kitchen.ingredient.altUnitName")} className={inputSm + " w-32"} />
            =
            <input value={edit.altUnitQty ?? ""} onChange={(e) => setEdit({ ...edit, altUnitQty: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} inputMode="decimal" className={inputSm + " w-24"} />
            {edit.unit}
            <span className="text-[12px]">{t("kitchen.ingredient.altUnitHint")}</span>
          </div>
          {error && <p className="text-[13px] text-red-600">{t(`kitchen.error.${error}`)}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => save(false)} disabled={!edit.name?.trim()} className={btn}>
              {t("common.save")}
            </button>
            <button type="button" onClick={() => save(true)} disabled={!edit.name?.trim()} className={btnPrimary}>
              {t("kitchen.ingredient.saveConfirm")}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-[12px] text-ink-secondary">{t("kitchen.ingredient.confirmHint")}</p>
        </div>
      )}
      <div className="flex flex-col divide-y divide-mist/60 rounded-lg border border-mist">
        {shown.map((r) => (
          <div key={r.id} className={"flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] " + (r.active ? "" : "opacity-60")}>
            <span>
              <span className="font-medium text-ink">{r.name}</span> <span className="text-ink-secondary">({r.unit}{r.altUnitName && r.altUnitQty ? `, 1 ${r.altUnitName} = ${r.altUnitQty} ${r.unit}` : ""})</span>
              {r.pantry && <span className="ml-1.5 rounded-full bg-paper-2 px-2 text-[11.5px] text-ink-secondary">{t("kitchen.ingredient.pantry")}</span>}
              <span className="ml-2 text-ink-secondary">{[r.storeHint, r.category].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={r.allergensConfirmed ? "text-ink-secondary" : "text-amber-700"}>
                <AllergenList codes={r.allergens} empty="—" />
                {!r.allergensConfirmed && ` · ${t("kitchen.unverified")}`}
              </span>
              {!r.allergensConfirmed && (
                <button type="button" onClick={async () => { await send(`/api/kitchen/ingredients/${r.id}`, "PATCH", { allergensConfirmed: true }); onChanged(); }} className="text-[12px] text-ember hover:underline">
                  {t("kitchen.ingredient.confirm")}
                </button>
              )}
              <button type="button" onClick={() => setEdit(r)} className="text-[12px] text-ember hover:underline">
                {t("common.edit")}
              </button>
              {r.active ? (
                <button type="button" onClick={() => remove(r)} className="text-[12px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              ) : (
                <button type="button" onClick={async () => { await send(`/api/kitchen/ingredients/${r.id}`, "PATCH", { active: true }); onChanged(); }} className="text-[12px] text-ink-secondary hover:underline">
                  {t("listTemplateAdmin.activate")}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ImportDraft = {
  name: string;
  servings: number;
  servingsGuessed: boolean;
  mealType: string | null;
  steps: string | null;
  duplicateOf: { id: string; name: string } | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  equipment: string | null;
  tags: string[];
  prepAheadOk: boolean;
  leftoverFriendly: boolean;
  coldPackable: boolean;
  variants: { name: string; swaps: { fromLine: number; toName: string; toIngredientId: string | null }[] }[];
  lines: { name: string; qtyPerAdultPortion: number | null; unit: "g" | "ml" | "ks"; ingredientId: string | null; warnings: string[]; note: string | null; pantry: boolean; altUnitName: string | null; suggestedAllergens: string[]; suggestedContains: string[]; suggestedCategory: string | null }[];
};

function ImportRecipes({ eventId, ingredients, onSaved }: { eventId: string; ingredients: Ingredient[]; onSaved: () => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ImportDraft[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setDrafts(null);
    setSaved(new Set());
    setDropped(new Set());
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/events/${eventId}/kitchen/import`, { method: "POST", body: form }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setError(d?.error ?? "failed");
    setDrafts(d.drafts);
    setNotes(d.notes);
  }
  // Everything the AI guessed is prefilled -- and shown as a guess, saved only on "Uložit do knihovny".
  const toDraft = (x: ImportDraft): MealDraft => ({
    ...emptyDraft(),
    name: x.name,
    mealType: x.mealType ?? "",
    steps: x.steps ?? "",
    prepMinutes: x.prepMinutes?.toString() ?? "",
    cookMinutes: x.cookMinutes?.toString() ?? "",
    equipment: x.equipment ?? "",
    tags: x.tags.join(", "),
    prepAheadOk: x.prepAheadOk,
    leftoverFriendly: x.leftoverFriendly,
    coldPackable: x.coldPackable,
    lines: x.lines.map((l) => ({
      ingredientId: l.ingredientId,
      name: l.name,
      unit: l.unit,
      qty: l.qtyPerAdultPortion ? String(l.qtyPerAdultPortion) : "",
      optional: false,
      note: l.note ?? "",
      allergens: l.suggestedAllergens,
      contains: l.suggestedContains,
      category: l.suggestedCategory,
      pantry: l.pantry,
      altUnitName: l.altUnitName,
      altUnitQty: l.altUnitName ? "1" : "",
      warnings: l.warnings,
    })),
    variants: x.variants.map((v) => ({ name: v.name, clearsAllergens: [], swaps: v.swaps.map((s) => ({ fromLine: s.fromLine, toName: s.toName, qty: "" })) })),
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[13px] text-ink-secondary">{t("kitchen.import.hint")}</p>
      <label className={btnPrimary + " self-start cursor-pointer"}>
        {busy ? t("kitchen.import.reading") : t("kitchen.import.pick")}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" disabled={busy} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p className="text-[13px] text-red-600">{t(`kitchen.import.error.${error}`)}</p>}
      {notes && <p className="text-[12.5px] text-ink-secondary">{t("kitchen.import.aiNotes")}: {notes}</p>}
      {drafts?.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.import.none")}</p>}
      {drafts?.map((x, k) =>
        dropped.has(k) ? null : saved.has(k) ? (
          <p key={k} className="rounded-lg bg-pine/10 px-3 py-2 text-[13px] text-pine">
            {t("kitchen.import.saved", { name: x.name })}
          </p>
        ) : (
          <MealEditor
            key={k}
            initial={toDraft(x)}
            ingredients={ingredients}
            saveLabel={t("kitchen.import.save")}
            banner={
              <div className="flex flex-col gap-1 text-[12.5px]">
                <p className="text-ink-secondary">{t(x.servingsGuessed ? "kitchen.import.servingsGuessed" : "kitchen.import.servings", { n: String(x.servings) })}</p>
                <p className="text-amber-700">{t("kitchen.import.aiAllergens")}</p>
                <p className="text-ink-secondary">{t("kitchen.import.aiGuesses")}</p>
                {x.duplicateOf && <p className="text-amber-700">{t("kitchen.import.duplicate", { name: x.duplicateOf.name })}</p>}
              </div>
            }
            onSave={async (body) => {
              const res = await send("/api/kitchen/meals", "POST", body);
              if (!res?.ok) return (await res?.json().catch(() => null))?.error ?? "failed";
              setSaved(new Set([...saved, k]));
              onSaved();
              return null;
            }}
            onCancel={() => setDropped(new Set([...dropped, k]))}
          />
        )
      )}
    </div>
  );
}
