"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { AllergenPicker } from "@/components/adults/AdultForm";
import { CONTENT_FLAGS, mealProfile } from "@/lib/kitchen/allergens";
import { nameKey } from "@/lib/kitchen/import-normalize";
import { AllergenList, Qty, btn, btnPrimary, inputClass, inputSm } from "./ui";

// Knihovna -> a meal: the recipe per ONE standard adult portion (g / ml / ks, or the ingredient's own second unit
// such as "stroužek" / "hrnek"), previewed for N portions; "vždy v kuchyni" items need no amount; allergens
// derived from the ingredients ("neověřeno" when an ingredient's aren't confirmed); variants (bezlepková…) swap
// ingredients -- also ones that are new right now (the AI import). Nothing is saved until "Uložit".
export type Ingredient = { id: string; name: string; unit: "g" | "ml" | "ks"; allergens: string[]; dietFlags: string[]; allergensConfirmed: boolean; active: boolean; pantry?: boolean; altUnitName?: string | null; altUnitQty?: number | null };
export type DraftLine = {
  ingredientId: string | null;
  name: string;
  unit: "g" | "ml" | "ks";
  // As typed, in the base unit -- or in the second unit when inAlt.
  qty: string;
  inAlt?: boolean;
  optional: boolean;
  note: string;
  // A new ingredient's data (AI suggestions in the import; saved "neověřeno").
  allergens: string[];
  contains?: string[];
  category?: string | null;
  pantry?: boolean;
  altUnitName?: string | null;
  altUnitQty?: string;
  warnings?: string[];
};
// fromLine: the line's index in the editor; to: a library ingredient (toIngredientId) or a name (a new one).
export type DraftSwap = { fromLine: number; toName: string; qty: string };
export type DraftVariant = { name: string; clearsAllergens: string[]; swaps: DraftSwap[] };
export type MealDraft = {
  name: string;
  mealType: string;
  tags: string;
  steps: string;
  prepMinutes: string;
  cookMinutes: string;
  equipment: string;
  prepAheadOk: boolean;
  leftoverFriendly: boolean;
  coldPackable: boolean;
  lines: DraftLine[];
  variants: DraftVariant[];
};
export const emptyDraft = (): MealDraft => ({ name: "", mealType: "", tags: "", steps: "", prepMinutes: "", cookMinutes: "", equipment: "", prepAheadOk: false, leftoverFriendly: false, coldPackable: false, lines: [], variants: [] });
const dec = (v: string) => Number(String(v).replace(",", "."));

export default function MealEditor({ initial, ingredients, onSave, onCancel, saveLabel, banner }: { initial: MealDraft; ingredients: Ingredient[]; onSave: (body: Record<string, unknown>) => Promise<string | null>; onCancel: () => void; saveLabel?: string; banner?: React.ReactNode }) {
  const { t } = useTranslations();
  const [d, setD] = useState<MealDraft>(initial);
  const [preview, setPreview] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(ingredients.map((i) => [nameKey(i.name), i])), [ingredients]);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const setLine = (k: number, patch: Partial<DraftLine>) => setD({ ...d, lines: d.lines.map((l, i) => (i === k ? { ...l, ...patch } : l)) });
  // Typing a name picks the library ingredient with that name (its unit); else it will be a new one.
  const rename = (k: number, name: string) => {
    const hit = byKey.get(nameKey(name));
    setLine(k, hit ? { name, ingredientId: hit.id, unit: hit.unit, inAlt: false } : { name, ingredientId: null });
  };
  const altOf = (l: DraftLine) => {
    const lib = l.ingredientId ? byId.get(l.ingredientId) : null;
    return lib ? (lib.altUnitName && lib.altUnitQty ? { name: lib.altUnitName, qty: lib.altUnitQty } : null) : l.altUnitName && dec(l.altUnitQty ?? "") > 0 ? { name: l.altUnitName, qty: dec(l.altUnitQty!) } : null;
  };
  const isPantry = (l: DraftLine) => (l.ingredientId ? !!byId.get(l.ingredientId)?.pantry : !!l.pantry);
  /** The line's quantity per portion in the base unit (0 = "dle potřeby"). */
  const baseQty = (l: DraftLine) => {
    const q = dec(l.qty) || 0;
    const alt = altOf(l);
    return l.inAlt && alt ? q * alt.qty : q;
  };
  const profile = mealProfile(
    d.lines.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId!, qty: baseQty(l) })),
    new Map(ingredients.map((i) => [i.id, i]))
  );
  const newAllergens = d.lines.filter((l) => !l.ingredientId).flatMap((l) => l.allergens);
  const allAllergens = [...new Set([...profile.allergens, ...newAllergens])];
  const unconfirmed = [...profile.unconfirmed, ...d.lines.filter((l) => !l.ingredientId && l.name.trim()).map((l) => l.name.trim())];
  const n = Number(preview) || 0;

  async function save() {
    setBusy(true);
    setError(null);
    // Lines without a name are dropped: the variants' line references follow the kept ones.
    const kept = d.lines.map((l, i) => ({ l, i })).filter((x) => x.l.name.trim());
    const indexOf = new Map(kept.map((x, j) => [x.i, j]));
    const err = await onSave({
      name: d.name,
      mealType: d.mealType,
      tags: d.tags.split(",").map((x) => x.trim()).filter(Boolean),
      steps: d.steps,
      prepMinutes: d.prepMinutes,
      cookMinutes: d.cookMinutes,
      equipment: d.equipment,
      prepAheadOk: d.prepAheadOk,
      leftoverFriendly: d.leftoverFriendly,
      coldPackable: d.coldPackable,
      yieldPortions: 10,
      lines: kept.map(({ l }) => ({
        ...(l.ingredientId
          ? { ingredientId: l.ingredientId }
          : { newIngredient: { name: l.name, unit: l.unit, allergens: l.allergens, dietFlags: l.contains ?? [], category: l.category ?? null, pantry: !!l.pantry, altUnitName: l.altUnitName || null, altUnitQty: l.altUnitName && dec(l.altUnitQty ?? "") > 0 ? dec(l.altUnitQty!) : null } }),
        qtyPerAdultPortion: Math.round(baseQty(l) * 1000) / 1000,
        optional: l.optional,
        note: l.note,
      })),
      variants: d.variants
        .filter((v) => v.name.trim())
        .map((v) => ({
          name: v.name,
          clearsAllergens: v.clearsAllergens,
          swaps: v.swaps
            .filter((s) => indexOf.has(s.fromLine) && s.toName.trim())
            .map((s) => {
              const lib = byKey.get(nameKey(s.toName));
              const from = d.lines[s.fromLine];
              return {
                fromLineIndex: indexOf.get(s.fromLine),
                ...(lib ? { toIngredientId: lib.id } : { toNewIngredient: { name: s.toName.trim(), unit: from.unit, allergens: [] } }),
                qtyPerAdultPortion: s.qty.trim() ? dec(s.qty) : null,
              };
            }),
        })),
    });
    setBusy(false);
    setError(err);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-mist bg-paper p-4">
      {banner}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary sm:col-span-2">
          {t("kitchen.meal.name")}
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
          {t("kitchen.meal.type")}
          <input value={d.mealType} onChange={(e) => setD({ ...d, mealType: e.target.value })} list="kitchen-meal-types" className={inputClass} />
          <datalist id="kitchen-meal-types">
            {["snídaně", "svačina", "oběd", "polévka", "večeře"].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">{t("kitchen.meal.ingredients")}</h3>
          <span className="text-[12.5px] text-ink-secondary">{t("kitchen.meal.perPortion")}</span>
        </div>
        <datalist id="kitchen-ingredients">
          {ingredients.filter((i) => i.active).map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        {d.lines.map((l, k) => {
          const alt = altOf(l);
          const pantry = isPantry(l);
          const lib = l.ingredientId ? byId.get(l.ingredientId) : null;
          return (
            <div key={k} className="flex flex-col gap-1 rounded-md border border-mist/60 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input value={l.name} onChange={(e) => rename(k, e.target.value)} list="kitchen-ingredients" placeholder={t("kitchen.meal.ingredient")} className={inputSm + " min-w-[12rem] flex-1"} />
                <input value={l.qty} onChange={(e) => setLine(k, { qty: e.target.value })} inputMode="decimal" placeholder={pantry ? t("kitchen.meal.asNeeded") : ""} className={inputSm + " w-24 text-right"} aria-label={t("kitchen.meal.qty")} />
                {lib && !alt ? (
                  <span className="w-12 text-[13px] text-ink-secondary">{l.unit}</span>
                ) : lib && alt ? (
                  <select value={l.inAlt ? "alt" : "base"} onChange={(e) => setLine(k, { inAlt: e.target.value === "alt" })} className={inputSm}>
                    <option value="base">{l.unit}</option>
                    <option value="alt">{alt.name}</option>
                  </select>
                ) : (
                  <select value={l.unit} onChange={(e) => setLine(k, { unit: e.target.value as DraftLine["unit"] })} className={inputSm}>
                    {(["g", "ml", "ks"] as const).map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                )}
                <span className="w-24 text-right text-[12px] text-ink-secondary">{n > 0 && (baseQty(l) > 0 ? <Qty q={baseQty(l) * n} unit={l.unit} /> : pantry ? t("kitchen.meal.asNeeded") : null)}</span>
                <label className="flex items-center gap-1 text-[12px] text-ink-secondary">
                  <input type="checkbox" checked={l.optional} onChange={(e) => setLine(k, { optional: e.target.checked })} />
                  {t("kitchen.meal.optional")}
                </label>
                <button type="button" onClick={() => setD({ ...d, lines: d.lines.filter((_, i) => i !== k), variants: d.variants.map((v) => ({ ...v, swaps: v.swaps.filter((s) => s.fromLine !== k).map((s) => ({ ...s, fromLine: s.fromLine > k ? s.fromLine - 1 : s.fromLine })) })) })} className="text-[12px] text-red-600 hover:underline">
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <input value={l.note} onChange={(e) => setLine(k, { note: e.target.value })} placeholder={t("kitchen.meal.lineNote")} className={inputSm + " min-w-[10rem] flex-1"} />
                {pantry && <span className="rounded-full bg-paper-2 px-2 text-ink-secondary">{t("kitchen.ingredient.pantry")}</span>}
                {lib ? (
                  <span className={lib.allergensConfirmed ? "text-ink-secondary" : "text-amber-700"}>
                    <AllergenList codes={lib.allergens} empty={t("kitchen.meal.noAllergens")} />
                    {!lib.allergensConfirmed && ` · ${t("kitchen.unverified")}`}
                  </span>
                ) : (
                  l.name.trim() && (
                    <span className="text-amber-700">
                      {t("kitchen.meal.newIngredient")}
                      {l.allergens.length > 0 && (
                        <>
                          {" · "}
                          {t("kitchen.meal.aiAllergens")}: <AllergenList codes={l.allergens} />
                        </>
                      )}
                    </span>
                  )
                )}
                {(l.warnings ?? []).filter((w) => w !== "new_ingredient").map((w) => (
                  <span key={w} className="rounded-full bg-amber-500/15 px-2 text-amber-800">
                    {t(`kitchen.import.warn.${w}`)}
                  </span>
                ))}
              </div>
              {!l.ingredientId && l.name.trim() && (
                <details className="text-[12px] text-ink-secondary">
                  <summary className="cursor-pointer">{t("kitchen.meal.newDetails")}</summary>
                  <div className="mt-1 flex flex-col gap-2">
                    <label className="flex items-center gap-1.5 text-ink">
                      <input type="checkbox" checked={!!l.pantry} onChange={(e) => setLine(k, { pantry: e.target.checked })} />
                      {t("kitchen.ingredient.pantry")}
                    </label>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {t("kitchen.ingredient.altUnit")}
                      <input value={l.altUnitName ?? ""} onChange={(e) => setLine(k, { altUnitName: e.target.value })} placeholder={t("kitchen.ingredient.altUnitName")} className={inputSm + " w-28"} />
                      =
                      <input value={l.altUnitQty ?? ""} onChange={(e) => setLine(k, { altUnitQty: e.target.value })} inputMode="decimal" className={inputSm + " w-20"} />
                      {l.unit}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {t("kitchen.ingredient.contains")}
                      {CONTENT_FLAGS.map((f) => (
                        <label key={f} className="flex items-center gap-1 text-ink">
                          <input type="checkbox" checked={(l.contains ?? []).includes(f)} onChange={(e) => setLine(k, { contains: e.target.checked ? [...(l.contains ?? []), f] : (l.contains ?? []).filter((x) => x !== f) })} />
                          {t(`kitchen.content.${f}`)}
                        </label>
                      ))}
                    </span>
                    <span>{t("kitchen.meal.newAllergens")}</span>
                    <AllergenPicker value={l.allergens} onChange={(v) => setLine(k, { allergens: v })} />
                  </div>
                </details>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setD({ ...d, lines: [...d.lines, { ingredientId: null, name: "", unit: "g", qty: "", optional: false, note: "", allergens: [] }] })} className={btn}>
            + {t("kitchen.meal.addLine")}
          </button>
          <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
            {t("kitchen.meal.previewFor")}
            <input value={preview} onChange={(e) => setPreview(e.target.value)} inputMode="numeric" className={inputSm + " w-16"} />
            {t("kitchen.meal.portions")}
          </label>
        </div>
        <p className="text-[13px] text-ink">
          {t("kitchen.meal.allergens")}: <AllergenList codes={allAllergens} empty={t("kitchen.meal.noAllergens")} />
          {unconfirmed.length > 0 && <span className="ml-2 text-amber-700">{t("kitchen.meal.unconfirmed", { names: unconfirmed.join(", ") })}</span>}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("kitchen.meal.variants")}</h3>
        <p className="text-[12px] text-ink-secondary">{t("kitchen.meal.variantsHint")}</p>
        {d.variants.map((v, k) => {
          const setV = (patch: Partial<DraftVariant>) => setD({ ...d, variants: d.variants.map((x, i) => (i === k ? { ...x, ...patch } : x)) });
          const setS = (j: number, patch: Partial<DraftSwap>) => setV({ swaps: v.swaps.map((x, i) => (i === j ? { ...x, ...patch } : x)) });
          return (
            <div key={k} className="flex flex-col gap-2 rounded-md border border-mist/60 p-2">
              <div className="flex items-center gap-2">
                <input value={v.name} onChange={(e) => setV({ name: e.target.value })} placeholder={t("kitchen.meal.variantName")} className={inputSm + " flex-1"} />
                <button type="button" onClick={() => setD({ ...d, variants: d.variants.filter((_, i) => i !== k) })} className="text-[12px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
              {v.swaps.map((s, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <select value={s.fromLine} onChange={(e) => setS(j, { fromLine: Number(e.target.value) })} className={inputSm}>
                    <option value={-1}>{t("kitchen.meal.swapFrom")}</option>
                    {d.lines.map((l, i) =>
                      l.name.trim() ? (
                        <option key={i} value={i}>
                          {l.name}
                        </option>
                      ) : null
                    )}
                  </select>
                  →
                  <input value={s.toName} onChange={(e) => setS(j, { toName: e.target.value })} list="kitchen-ingredients" placeholder={t("kitchen.meal.swapTo")} className={inputSm + " min-w-[10rem]"} />
                  {s.toName.trim() && !byKey.has(nameKey(s.toName)) && <span className="text-[11.5px] text-amber-700">{t("kitchen.meal.newIngredientShort")}</span>}
                  <input value={s.qty} onChange={(e) => setS(j, { qty: e.target.value })} inputMode="decimal" placeholder={t("kitchen.meal.swapQty")} className={inputSm + " w-28"} />
                  <button type="button" onClick={() => setV({ swaps: v.swaps.filter((_, i) => i !== j) })} className="text-[12px] text-red-600">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setV({ swaps: [...v.swaps, { fromLine: -1, toName: "", qty: "" }] })} className="self-start text-[12.5px] text-ember hover:underline">
                + {t("kitchen.meal.addSwap")}
              </button>
              <details className="text-[12.5px] text-ink-secondary">
                <summary className="cursor-pointer">
                  {t("kitchen.meal.clears")}: <AllergenList codes={v.clearsAllergens} empty="—" />
                </summary>
                <AllergenPicker value={v.clearsAllergens} onChange={(x) => setV({ clearsAllergens: x })} />
              </details>
            </div>
          );
        })}
        <button type="button" onClick={() => setD({ ...d, variants: [...d.variants, { name: "", clearsAllergens: [], swaps: [] }] })} className={btn + " self-start"}>
          + {t("kitchen.meal.addVariant")}
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary sm:col-span-3">
          {t("kitchen.meal.steps")}
          <textarea value={d.steps} onChange={(e) => setD({ ...d, steps: e.target.value })} rows={5} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
          {t("kitchen.meal.prepMinutes")}
          <input value={d.prepMinutes} onChange={(e) => setD({ ...d, prepMinutes: e.target.value })} inputMode="numeric" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
          {t("kitchen.meal.cookMinutes")}
          <input value={d.cookMinutes} onChange={(e) => setD({ ...d, cookMinutes: e.target.value })} inputMode="numeric" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
          {t("kitchen.meal.equipment")}
          <input value={d.equipment} onChange={(e) => setD({ ...d, equipment: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-secondary sm:col-span-3">
          {t("kitchen.meal.tags")}
          <input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} placeholder={t("kitchen.meal.tagsPlaceholder")} className={inputClass} />
        </label>
        <div className="flex flex-wrap gap-4 text-[13px] text-ink sm:col-span-3">
          {(["prepAheadOk", "leftoverFriendly", "coldPackable"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} />
              {t(`kitchen.meal.${k}`)}
            </label>
          ))}
        </div>
      </section>

      {error && <p className="text-[13px] text-red-600">{t(`kitchen.error.${error}`)}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={busy || !d.name.trim()} className={btnPrimary}>
          {saveLabel ?? t("common.save")}
        </button>
        <button type="button" onClick={onCancel} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
