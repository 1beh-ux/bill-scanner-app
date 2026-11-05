"use client";

import HelpLink from "@/components/HelpLink";
import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { AllergenPicker, DietPicker } from "@/components/adults/AdultForm";
import { AllergenList, NoAccess, btn, btnPrimary, inputSm, send } from "@/components/kitchen/ui";
import { useDiets } from "@/components/kitchen/useDiets";
import { UnmappedChip } from "@/components/kitchen/DietWarnings";

// Strava účastníků: each participant's allergy answer with what the app reads in it (a proposal), confirmed
// by a person. Unconfirmed = "neověřeno" everywhere -- never "no allergy". A text changed after the
// confirmation is flagged again. Adults' data come from Lidé (read-only here).
type Row = {
  participantId: string;
  name: string;
  rawText: string;
  status: "confirmed" | "unverified" | "none";
  changed: boolean;
  proposal: { allergens: string[]; dietFlags: string[]; unmapped: string[] };
  review: { allergens: string[]; dietFlags: string[]; note: string | null; confirmedAt: string; unmapped: string[]; unmappedReviewed: boolean } | null;
};
type AdultRow = { id: string; childId: string; name: string; eats: boolean; allergens: string[]; dietFlags: string[]; dietNote: string | null };
type Data = { allergyFieldKey: string | null; fields: { key: string; label: string }[]; participants: Row[]; adults: AdultRow[] };

export default function KitchenDietsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const { name: dietName } = useDiets();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const url = `/api/events/${id}/kitchen/diets`;
  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403 || res?.status === 404) return setDenied(true);
    if (res?.ok) setData(await res.json());
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  if (denied) return <NoAccess />;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  const open = data.participants.filter((p) => p.status === "unverified");
  const shown = filter === "open" ? open : data.participants;
  const field = data.fields.find((f) => f.key === data.allergyFieldKey);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("kitchen.navDiets")} <HelpLink slug="kuchyne" /></h1>
      <p className="mb-2 max-w-3xl text-[13px] text-ink-secondary">{t("kitchen.diets.hint")}</p>
      <p className="mb-4 text-[13px] text-ink-secondary">
        {field ? t("kitchen.diets.field", { field: field.label }) : t("kitchen.diets.noField")}{" "}
        <a href={`/events/${id}?tab=kuchyne`} className="text-ember hover:underline">
          {t("kitchen.diets.changeField")}
        </a>
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["open", "all"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={"rounded-full px-3 py-1 text-[13px] " + (filter === k ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist")}>
            {t(`kitchen.diets.filter.${k}`, { n: String(k === "open" ? open.length : data.participants.length) })}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {shown.length === 0 && <p className="text-[13px] text-ink-secondary">{t("kitchen.diets.allDone")}</p>}
        {shown.map((p) => (
          <DietRow key={p.participantId} url={url} p={p} onChanged={load} />
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-[16px] font-semibold text-ink">{t("kitchen.diets.adults")}</h2>
      <p className="mb-2 text-[12.5px] text-ink-secondary">{t("kitchen.diets.adultsHint")}</p>
      <div className="flex flex-col divide-y divide-mist/60 rounded-lg border border-mist">
        {data.adults.map((a) => (
          <div key={a.id} className={"flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] " + (a.eats ? "" : "opacity-60")}>
            <a href={`/children/${a.childId}`} className="font-medium text-ink hover:underline">
              {a.name}
            </a>
            <span className="text-ink-secondary">
              <AllergenList codes={a.allergens} empty={t("kitchen.diets.nothing")} />
              {a.dietFlags.length > 0 && ` · ${a.dietFlags.map(dietName).join(", ")}`}
              {a.dietNote && ` · ${a.dietNote}`}
            </span>
          </div>
        ))}
        {data.adults.length === 0 && <p className="px-3 py-2 text-[13px] text-ink-secondary">—</p>}
      </div>
    </div>
  );
}

function DietRow({ url, p, onChanged }: { url: string; p: Row; onChanged: () => void }) {
  const { t } = useTranslations();
  const { name: dietName } = useDiets();
  const start = p.review && !p.changed ? p.review : p.proposal;
  const [allergens, setAllergens] = useState(start.allergens);
  const [dietFlags, setDietFlags] = useState(start.dietFlags);
  const [note, setNote] = useState(p.review?.note ?? "");
  const [editing, setEditing] = useState(p.status === "unverified");
  const [reviewed, setReviewed] = useState(!!p.review?.unmappedReviewed);
  const [error, setError] = useState<string | null>(null);
  const needsReview = p.proposal.unmapped.length > 0 && !note.trim() && !reviewed;
  async function confirmIt() {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: p.participantId, allergens, dietFlags, note, unmappedReviewed: reviewed }) }).catch(() => null);
    if (!res?.ok) return setError(t(res?.status === 400 ? "kitchen.dietWarnings.needsReview" : "kitchen.dietWarnings.saveFailed"));
    setEditing(false);
    onChanged();
  }
  const badge = p.status === "confirmed" ? "bg-pine/15 text-pine" : p.status === "unverified" ? "bg-amber-500/15 text-amber-700" : "bg-paper-2 text-ink-secondary";
  return (
    <div className={"flex flex-col gap-2 rounded-lg border p-3 " + (p.status === "unverified" ? "border-amber-500/60" : "border-mist")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[14px] font-semibold text-ink">{p.name}</span>
          <span className={"ml-2 rounded-full px-2 py-0.5 text-[11.5px] " + badge}>{p.changed ? t("kitchen.diets.changed") : t(`kitchen.diets.status.${p.status}`)}</span>
          <p className="whitespace-pre-line text-[13px] text-ink-secondary">{p.rawText || "—"}</p>
          {p.proposal.unmapped.length > 0 && (
            <p className="text-[12.5px] text-amber-700">
              <UnmappedChip words={p.proposal.unmapped} />
            </p>
          )}
          {p.status === "confirmed" && p.review && p.review.unmapped.length > 0 && (
            <p className="text-[12px] text-ink-secondary">{p.review.note ? t("kitchen.dietWarnings.reviewedNote", { note: p.review.note }) : t("kitchen.dietWarnings.reviewedTick")}</p>
          )}
        </div>
        {!editing && (
          <span className="flex items-center gap-3 text-[13px]">
            <span>
              <AllergenList codes={start.allergens} empty={t("kitchen.diets.nothing")} />
              {start.dietFlags.length > 0 && ` · ${start.dietFlags.map(dietName).join(", ")}`}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="text-[12px] text-ember hover:underline">
              {t("common.edit")}
            </button>
          </span>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <AllergenPicker value={allergens} onChange={setAllergens} />
          <DietPicker value={dietFlags} onChange={setDietFlags} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("kitchen.diets.note")} className={inputSm} />
          {p.proposal.unmapped.length > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              {t("kitchen.dietWarnings.reviewedLabel", { words: p.proposal.unmapped.join(", ") })}
            </label>
          )}
          {needsReview && <p className="text-[12px] text-amber-800">{t("kitchen.dietWarnings.needsReview")}</p>}
          {error && <p className="text-[12px] text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={confirmIt} disabled={needsReview} className={btnPrimary}>
              {t("kitchen.diets.confirm")}
            </button>
            {p.review && (
              <button type="button" onClick={async () => { await send(`${url}?participantId=${p.participantId}`, "DELETE"); onChanged(); }} className={btn}>
                {t("kitchen.diets.unconfirm")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
