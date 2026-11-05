"use client";

import DietWarnings, { UnmappedChip } from "@/components/kitchen/DietWarnings";
import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { AllergenList, CheckBadge, NoAccess, Qty, btn, fmtDay, inputSm, send } from "@/components/kitchen/ui";
import type { Entry, PlanData } from "../types";

// Kuchyně dnes (phone first) = the cook sheet: the day's meals with portions, quantities, special portions
// with names, steps and notes; printable. "Jak to dopadlo" unlocks feedbackUnlockMinutes after serving.
// The last loaded day is kept in localStorage so the sheet still opens without signal (no service worker).
const cacheKey = (id: string, date: string) => `kitchen-today:${id}:${date}`;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function KitchenTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<PlanData | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (day: string) => {
    const res = await fetch(`/api/events/${id}/kitchen?date=${day}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) {
      const d = (await res.json()) as PlanData;
      setData(d);
      setOfflineAt(null);
      try {
        localStorage.setItem(cacheKey(id, day), JSON.stringify({ at: new Date().toISOString(), data: d }));
      } catch {}
      return d;
    }
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(id, day)) ?? "null");
      if (cached) {
        setData(cached.data);
        setOfflineAt(cached.at);
      }
    } catch {}
    return null;
  }, [id]);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("date");
    const day = wanted ?? todayIso();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    setDate(day);
    load(day).then((d) => {
      // Outside the event: its first day.
      if (d && !wanted && !d.days.includes(day) && d.days[0]) {
        setDate(d.days[0]);
        load(d.days[0]);
      }
    });
  }, [load]);

  if (denied) return <NoAccess />;
  if (!data || !date) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const slotOrder = new Map(data.slots.map((s, i) => [s.id, i]));
  const entries = [...data.entries].sort((a, b) => (slotOrder.get(a.slotItemId) ?? 99) - (slotOrder.get(b.slotItemId) ?? 99));
  const i = data.days.indexOf(date);
  const go = (d: string) => {
    setDate(d);
    history.replaceState(null, "", `?date=${d}`);
    load(d);
  };

  return (
    <div className="mx-auto max-w-2xl p-3 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[20px] font-semibold text-ink">
          {t("kitchen.navToday")} · {fmtDay(date, lang)}
        </h1>
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" disabled={i <= 0} onClick={() => go(data.days[i - 1])} className={btn} aria-label={t("kitchen.today.prev")}>
            ←
          </button>
          <button type="button" disabled={i < 0 || i >= data.days.length - 1} onClick={() => go(data.days[i + 1])} className={btn} aria-label={t("kitchen.today.next")}>
            →
          </button>
          <button type="button" onClick={() => window.print()} className={btn}>
            {t("kitchen.print")}
          </button>
        </div>
      </div>
      {offlineAt && <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-[13px] text-amber-800">{t("kitchen.today.offline", { time: new Date(offlineAt).toLocaleString("cs-CZ") })}</p>}
      <DietWarnings warnings={data.dietWarnings} eventId={id} />
      {entries.length === 0 && <p className="text-[14px] text-ink-secondary">{t("kitchen.today.empty")}</p>}
      <div className="flex flex-col gap-4">
        {entries.map((e) => (
          <CookCard key={e.id} eventId={id} e={e} slot={data.slots.find((s) => s.id === e.slotItemId)?.name ?? ""} notes={data.notes.filter((n) => n.mealId === e.mealId)} unlockMinutes={data.settings.feedbackUnlockMinutes} offline={!!offlineAt} onChanged={() => load(date)} />
        ))}
      </div>
    </div>
  );
}

function CookCard({ eventId, e, slot, notes, unlockMinutes, offline, onChanged }: { eventId: string; e: Entry; slot: string; notes: PlanData["notes"]; unlockMinutes: number; offline: boolean; onChanged: () => void }) {
  const { t } = useTranslations();
  const s = e.sheet;
  const c = e.check;
  const time = e.servingTime;
  const unlockAt = time ? new Date(`${e.date}T${time}:00`).getTime() + unlockMinutes * 60000 : new Date(`${e.date}T00:00:00`).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(tm);
  }, []);
  return (
    <article className="break-inside-avoid rounded-xl border border-mist bg-paper p-3">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-ink">
          <span className="text-ink-secondary">{slot}</span> · {s.mealName || e.name}
        </h2>
        <span className="text-[13px] text-ink-secondary">
          {time && `${time} · `}
          <b className="text-ink">{s.portions.toLocaleString("cs-CZ")}</b> {t("kitchen.plan.portionsShort")} ({e.headcount.eaters} {t("kitchen.plan.people")}){s.multiplier != null && ` · ×${s.multiplier}`}
        </span>
      </header>
      {c && c.level !== "ok" && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
          <CheckBadge level={c.level} />
          {c.uncovered.length > 0 && <span className="text-red-700">{t("kitchen.today.uncovered", { names: c.uncovered.join(", ") })}</span>}
          {c.unverifiedPeople > 0 && <span className="text-amber-700">{t("kitchen.plan.unverifiedPeople", { n: String(c.unverifiedPeople) })}</span>}
          {c.unconfirmedIngredients.length > 0 && <span className="text-amber-700">{t("kitchen.plan.unconfirmedIngredients", { names: c.unconfirmedIngredients.join(", ") })}</span>}
        </div>
      )}
      {c?.conflicts.map((x) => (
        <p key={x.key} className="mb-1 text-[13px] text-ink">
          <b>{x.name}</b>: <AllergenList codes={x.allergens} />
          {x.rawText && <span className="text-[12px] text-ink-secondary"> („{x.rawText}“)</span>}
          <UnmappedChip words={x.unmapped} />
        </p>
      ))}
      <p className="mb-2 text-[12.5px] text-ink-secondary">
        {t("kitchen.plan.allergens")}: <AllergenList codes={s.allergens} empty={t("kitchen.plan.noAllergens")} />
      </p>
      <table className="mb-2 w-full text-[15px]">
        <tbody>
          {s.lines.map((l) => (
            <tr key={l.ingredientId} className="border-b border-mist/40">
              <td className="py-1">{l.name}</td>
              <td className="py-1 text-right font-semibold">
                <Qty q={l.qty} unit={l.unit} altName={l.altUnitName} altQty={l.altUnitQty} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.variants.map((v) => (
        <p key={v.id} className="mb-1 rounded-md bg-ember/10 px-2 py-1 text-[14px]">
          ★ {v.name}: <b>{v.portions}×</b> – {v.names.join(", ")}
        </p>
      ))}
      {s.steps && <p className="mb-2 whitespace-pre-line text-[14px] text-ink">{s.steps}</p>}
      {(notes.length > 0 || e.note) && (
        <div className="mb-2 flex flex-col gap-1 text-[13px]">
          {e.note && <p className="rounded-md bg-paper-2 px-2 py-1">{e.note}</p>}
          {notes.map((n) => (
            <p key={n.id} className="rounded-md bg-paper-2 px-2 py-1 whitespace-pre-line">
              {n.body}
            </p>
          ))}
        </div>
      )}
      <div className="print:hidden">
        {e.feedback ? (
          <FeedbackDone eventId={eventId} e={e} onChanged={onChanged} />
        ) : now >= unlockAt ? (
          <FeedbackStrip eventId={eventId} e={e} disabled={offline} onChanged={onChanged} />
        ) : (
          <p className="text-[12px] text-ink-secondary">{t("kitchen.feedback.locked", { time: new Date(unlockAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) })}</p>
        )}
      </div>
    </article>
  );
}

function FeedbackStrip({ eventId, e, disabled, onChanged }: { eventId: string; e: Entry; disabled: boolean; onChanged: () => void }) {
  const { t } = useTranslations();
  const [verdict, setVerdict] = useState<"short" | "ok" | "leftover" | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!verdict) return;
    setBusy(true);
    await send(`/api/events/${eventId}/kitchen/entries/${e.id}/feedback`, "PUT", { verdict, leftoverPercent: verdict === "leftover" ? pct : null, shortPercent: verdict === "short" ? pct : null, stars, note });
    setBusy(false);
    onChanged();
  }
  const chip = (on: boolean) => "rounded-full border px-3 py-2 text-[14px] " + (on ? "border-ember bg-ember/15 text-ink" : "border-mist bg-paper-2 text-ink");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ember/40 p-2">
      <span className="text-[13px] font-medium text-ink">{t("kitchen.feedback.title")}</span>
      <div className="flex flex-wrap gap-2">
        {(["short", "ok", "leftover"] as const).map((v) => (
          <button key={v} type="button" onClick={() => { setVerdict(v); setPct(null); }} className={chip(verdict === v)}>
            {t(`kitchen.feedback.${v}`)}
          </button>
        ))}
      </div>
      {(verdict === "leftover" || verdict === "short") && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-secondary">{t(verdict === "leftover" ? "kitchen.feedback.howMuchLeft" : "kitchen.feedback.howMuchShort")}</span>
          {[5, 10, 20, 30, 50].map((p) => (
            <button key={p} type="button" onClick={() => setPct(p)} className={chip(pct === p)}>
              {p} %
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(stars === n ? null : n)} className={"text-[22px] " + ((stars ?? 0) >= n ? "text-ember" : "text-mist")} aria-label={`${n}`}>
            ★
          </button>
        ))}
      </div>
      <input value={note} onChange={(x) => setNote(x.target.value)} placeholder={t("kitchen.feedback.note")} className={inputSm} />
      <button type="button" disabled={!verdict || busy || disabled} onClick={save} className="rounded-lg bg-ember px-4 py-2 text-[15px] font-medium text-white disabled:opacity-50">
        {t("kitchen.feedback.save")}
      </button>
    </div>
  );
}

function FeedbackDone({ eventId, e, onChanged }: { eventId: string; e: Entry; onChanged: () => void }) {
  const { t } = useTranslations();
  const f = e.feedback!;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
      <span className="rounded-full bg-pine/15 px-2.5 py-0.5 text-pine">
        {t(`kitchen.feedback.${f.verdict}`)}
        {f.leftoverPercent != null && ` ${f.leftoverPercent} %`}
        {f.shortPercent != null && ` ${f.shortPercent} %`}
      </span>
      {f.stars != null && <span className="text-ember">{"★".repeat(f.stars)}</span>}
      {f.note && <span className="text-ink-secondary">{f.note}</span>}
      <button type="button" onClick={async () => { await send(`/api/events/${eventId}/kitchen/entries/${e.id}/feedback`, "DELETE"); onChanged(); }} className="text-[12px] text-ink-secondary hover:underline">
        {t("kitchen.feedback.redo")}
      </button>
    </p>
  );
}
