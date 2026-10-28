"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLevelUrl } from "@/lib/template-level";
import { btn, inputSm, send } from "./ui";

// Kuchyně lists: the meal slots (name, time) and the age bands (age from–to, portion factor of a standard
// adult). Organization templates (Šablony -> Kuchyně) or one event's copy (Nastavení akce -> Kuchyně).
type Item = { id: string; name: string; sortOrder: number | null; active: boolean; data: { time?: string; ageFrom?: number; ageTo?: number | null; factor?: number } | null };

export default function KitchenLists({ kind, scope, eventId }: { kind: "kitchen_slot" | "kitchen_band"; scope: "org" | "event"; eventId?: string }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const lvl = useLevelUrl();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState({ name: "", time: "", ageFrom: "", ageTo: "", factor: "" });
  const base = scope === "org" ? "/api/list-templates" : `/api/events/${eventId}/list-items`;
  const listUrl = scope === "org" ? lvl(`${base}?kind=${kind}`) : `${base}?kind=${kind}&all=true`;
  const itemUrl = (id: string) => (scope === "org" ? lvl(`${base}/${id}`) : `${base}/${id}`);
  const isSlot = kind === "kitchen_slot";

  const load = useCallback(async () => {
    // An event's lists are created from the organization's on first use (the plan's GET).
    if (scope === "event") await fetch(`/api/events/${eventId}/kitchen`).catch(() => null);
    const res = await fetch(listUrl, { cache: "no-store" }).catch(() => null);
    setItems(res?.ok ? await res.json() : []);
  }, [listUrl, scope, eventId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  const dataOf = (d: typeof draft) =>
    isSlot ? { time: /^\d{2}:\d{2}$/.test(d.time) ? d.time : undefined } : { ageFrom: Number(d.ageFrom) || 0, ageTo: d.ageTo === "" ? null : Number(d.ageTo), factor: Number(String(d.factor).replace(",", ".")) || 1 };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    await send(scope === "org" ? lvl(base) : base, "POST", { kind, name: draft.name, sortOrder: items.length, data: dataOf(draft) });
    setDraft({ name: "", time: "", ageFrom: "", ageTo: "", factor: "" });
    load();
  }
  async function patch(i: Item, body: Record<string, unknown>) {
    await send(itemUrl(i.id), "PATCH", body);
    load();
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(next.map((x, k) => send(itemUrl(x.id), "PATCH", { sortOrder: k })));
    load();
  }
  async function remove(i: Item) {
    if (!(await confirm({ message: t("kitchen.lists.confirmDelete", { name: i.name }), danger: true }))) return;
    const res = await send(itemUrl(i.id), "DELETE");
    // A slot with meals in the plan can't go: it's deactivated instead.
    if (!res?.ok) await send(itemUrl(i.id), "PATCH", { active: false });
    load();
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[15px] font-semibold text-ink">{t(isSlot ? "kitchen.lists.slots" : "kitchen.lists.bands")}</h3>
      <p className="max-w-2xl text-[12.5px] text-ink-secondary">{t(isSlot ? "kitchen.lists.slotsHint" : "kitchen.lists.bandsHint")}</p>
      {items.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.lists.emptyDefaults")}</p>}
      <div className="flex flex-col gap-1">
        {items.map((i, k) => (
          <div key={i.id} className={"flex flex-wrap items-center gap-2 rounded-lg border border-mist/60 px-2 py-1.5 text-[14px] " + (i.active ? "" : "opacity-60")}>
            <span className="flex flex-col text-[11px] leading-none text-ink-secondary">
              <button type="button" onClick={() => move(k, -1)} aria-label={t("kitchen.lists.up")}>▲</button>
              <button type="button" onClick={() => move(k, 1)} aria-label={t("kitchen.lists.down")}>▼</button>
            </span>
            <input defaultValue={i.name} onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && patch(i, { name: e.target.value })} className={inputSm + " min-w-[10rem] flex-1"} aria-label={t("kitchen.lists.name")} />
            {isSlot ? (
              <input type="time" defaultValue={i.data?.time ?? ""} onBlur={(e) => patch(i, { data: { ...i.data, time: e.target.value || undefined } })} className={inputSm} aria-label={t("kitchen.lists.time")} />
            ) : (
              <>
                <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
                  {t("kitchen.lists.ageFrom")}
                  <input type="number" min={0} defaultValue={i.data?.ageFrom ?? 0} onBlur={(e) => patch(i, { data: { ...i.data, ageFrom: Number(e.target.value) || 0 } })} className={inputSm + " w-16"} />
                </label>
                <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
                  {t("kitchen.lists.ageTo")}
                  <input type="number" min={0} defaultValue={i.data?.ageTo ?? ""} onBlur={(e) => patch(i, { data: { ...i.data, ageTo: e.target.value === "" ? null : Number(e.target.value) } })} className={inputSm + " w-16"} />
                </label>
                <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
                  {t("kitchen.lists.factor")}
                  <input type="number" step="0.05" min={0.1} defaultValue={i.data?.factor ?? 1} onBlur={(e) => patch(i, { data: { ...i.data, factor: Number(e.target.value) || 1 } })} className={inputSm + " w-20"} />
                </label>
              </>
            )}
            <button type="button" onClick={() => patch(i, { active: !i.active })} className="text-[12px] text-ink-secondary hover:text-ink">
              {i.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
            </button>
            <button type="button" onClick={() => remove(i)} className="text-[12px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("kitchen.lists.name")} className={inputSm + " min-w-[10rem]"} />
        {isSlot ? (
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className={inputSm} aria-label={t("kitchen.lists.time")} />
        ) : (
          <>
            <input type="number" min={0} value={draft.ageFrom} onChange={(e) => setDraft({ ...draft, ageFrom: e.target.value })} placeholder={t("kitchen.lists.ageFrom")} className={inputSm + " w-20"} />
            <input type="number" min={0} value={draft.ageTo} onChange={(e) => setDraft({ ...draft, ageTo: e.target.value })} placeholder={t("kitchen.lists.ageTo")} className={inputSm + " w-20"} />
            <input type="number" step="0.05" value={draft.factor} onChange={(e) => setDraft({ ...draft, factor: e.target.value })} placeholder={t("kitchen.lists.factor")} className={inputSm + " w-24"} />
          </>
        )}
        <button type="submit" disabled={!draft.name.trim()} className={btn}>
          + {t("kitchen.lists.add")}
        </button>
      </form>
    </section>
  );
}
