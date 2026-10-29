"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { AllergenPicker } from "@/components/adults/AdultForm";
import { CONTENT_FLAGS, dietCode } from "@/lib/kitchen/allergens";
import { AllergenList, btn, inputSm, send } from "./ui";
import { reloadDiets } from "./useDiets";

// Šablony -> Kuchyně -> Diety (2026-10-29): the organization's diets (vegetarián, bezlepková, bez laktózy…).
// Per diet: the words that recognise it in parents' allergy texts, and what breaks it -- ingredient contents
// (maso, mléčné…) and / or allergens. The code (key) is fixed once created: people's data refer to it.
type Row = { id: string; key: string | null; name: string; active: boolean; sortOrder: number | null; data: { keywords?: string[]; contents?: string[]; allergens?: string[] } | null };

export default function KitchenDiets() {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    // GET /api/kitchen/diets creates the defaults on first use.
    await fetch("/api/kitchen/diets").catch(() => null);
    const res = await fetch("/api/list-templates?kind=kitchen_diet", { cache: "no-store" }).catch(() => null);
    setRows(res?.ok ? await res.json() : []);
    reloadDiets();
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  async function patch(r: Row, body: Record<string, unknown>) {
    await send(`/api/list-templates/${r.id}`, "PATCH", body);
    load();
  }
  const setData = (r: Row, d: Partial<NonNullable<Row["data"]>>) => patch(r, { data: { keywords: [], contents: [], allergens: [], ...r.data, ...d } });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const taken = new Set(rows.map((r) => r.key));
    let key = dietCode(name);
    for (let i = 2; taken.has(key); i++) key = `${dietCode(name)}_${i}`;
    await send("/api/list-templates", "POST", { kind: "kitchen_diet", name, key, sortOrder: rows.length, data: { keywords: [name.trim().toLowerCase()], contents: [], allergens: [] } });
    setName("");
    setOpen(key);
    load();
  }
  async function remove(r: Row) {
    if (!(await confirm({ message: t("kitchen.diets.confirmDeleteDiet", { name: r.name }), danger: true }))) return;
    await send(`/api/list-templates/${r.id}`, "DELETE");
    load();
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[15px] font-semibold text-ink">{t("kitchen.diets.listTitle")}</h3>
      <p className="max-w-2xl text-[12.5px] text-ink-secondary">{t("kitchen.diets.listHint")}</p>
      {rows.map((r) => (
        <div key={r.id} className={"rounded-lg border border-mist/60 p-2 text-[13px] " + (r.active ? "" : "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <input defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && patch(r, { name: e.target.value })} className={inputSm + " min-w-[10rem] flex-1"} aria-label={t("kitchen.lists.name")} />
            <span className="text-[12px] text-ink-secondary">
              {(r.data?.contents ?? []).map((c) => t(`kitchen.content.${c}`)).join(", ")}
              {(r.data?.allergens ?? []).length > 0 && (
                <>
                  {(r.data?.contents ?? []).length > 0 && " · "}
                  <AllergenList codes={r.data!.allergens!} />
                </>
              )}
            </span>
            <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)} className="text-[12px] text-ember hover:underline">
              {t("common.edit")}
            </button>
            <button type="button" onClick={() => patch(r, { active: !r.active })} className="text-[12px] text-ink-secondary hover:text-ink">
              {r.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
            </button>
            <button type="button" onClick={() => remove(r)} className="text-[12px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
          </div>
          {open === r.key && (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
                {t("kitchen.diets.keywords")}
                <input defaultValue={(r.data?.keywords ?? []).join(", ")} onBlur={(e) => setData(r, { keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} className={inputSm} />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                <span className="text-ink-secondary">{t("kitchen.diets.breaksContents")}</span>
                {CONTENT_FLAGS.map((c) => (
                  <label key={c} className="flex items-center gap-1">
                    <input type="checkbox" checked={(r.data?.contents ?? []).includes(c)} onChange={(e) => setData(r, { contents: e.target.checked ? [...(r.data?.contents ?? []), c] : (r.data?.contents ?? []).filter((x) => x !== c) })} />
                    {t(`kitchen.content.${c}`)}
                  </label>
                ))}
              </div>
              <span className="text-[12.5px] text-ink-secondary">{t("kitchen.diets.breaksAllergens")}</span>
              <AllergenPicker value={r.data?.allergens ?? []} onChange={(v) => setData(r, { allergens: v })} />
            </div>
          )}
        </div>
      ))}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("kitchen.diets.newDiet")} className={inputSm + " min-w-[12rem]"} />
        <button type="submit" disabled={!name.trim()} className={btn}>
          + {t("kitchen.lists.add")}
        </button>
      </form>
    </section>
  );
}
