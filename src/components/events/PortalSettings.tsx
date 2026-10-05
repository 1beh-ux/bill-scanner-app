"use client";

import { useEffect, useState } from "react";
import type { Eligibility } from "@/lib/portal-rules";

type AutoAcceptMode = "manual" | "accept" | "accept_send";

// Event settings -> "Registrace a členství": "Otevřeno pro přihlášky v portálu"
// and who may register (docs/registration-portal-spec.md H). Only shown for a
// connected event or a membership year; off by default.
type Options = {
  groups: string[];
  events: { id: string; name: string; startDate: string; kind: "event" | "membership"; membershipYear: number | null }[];
  children: { id: string; name: string; dateOfBirth: string | null }[];
};
type Eligible = { id: string; name: string; dateOfBirth: string | null };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const box = "scrollbar-app flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-mist p-2";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const childLabel = (c: { name: string; dateOfBirth: string | null }) => `${c.name} (${date(c.dateOfBirth)})`;
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function PortalSettings({
  eventId,
  event,
  onSaved,
  t,
}: {
  eventId: string;
  event: {
    portalOpen: boolean;
    eligibility: unknown;
    registrationDeadline: string | null;
    autoAccept: AutoAcceptMode;
    autoSendReady?: boolean | null;
    location: string | null;
    portalInfo: string | null;
    paymentDocTypeId: string | null;
  };
  onSaved: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const initial = (event.eligibility ?? {}) as Eligibility;
  const [open, setOpen] = useState(event.portalOpen);
  // Auto-accept of portal / public registrations (slice 3 E); manual = as before.
  const [autoAccept, setAutoAccept] = useState<AutoAcceptMode>(event.autoAccept);
  // Shown on the portal's registration card (slice 3 F).
  const [location, setLocation] = useState(event.location ?? "");
  const [portalInfo, setPortalInfo] = useState(event.portalInfo ?? "");
  // "Dokument platby" (slice 4 #5): received = "Zaplaceno" in the portal; none = as before.
  const [paymentDocTypeId, setPaymentDocTypeId] = useState(event.paymentDocTypeId ?? "");
  const [docTypes, setDocTypes] = useState<{ id: string; name: string }[]>([]);
  const [everyone, setEveryone] = useState(!!initial.everyone);
  const [yearFrom, setYearFrom] = useState(initial.birthYearFrom != null ? String(initial.birthYearFrom) : "");
  const [yearTo, setYearTo] = useState(initial.birthYearTo != null ? String(initial.birthYearTo) : "");
  const [groups, setGroups] = useState<string[]>(initial.groups ?? []);
  const [attended, setAttended] = useState<string[]>(initial.attendedEventIds ?? []);
  const [childIds, setChildIds] = useState<string[]>(initial.childIds ?? []);
  const [childPick, setChildPick] = useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [eligible, setEligible] = useState<Eligible[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/portal-eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setOptions)
      .catch(() => {});
    fetch(`/api/events/${eventId}/list-items?kind=document`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocTypes)
      .catch(() => {});
  }, [eventId]);

  const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v.trim()) : undefined);
  const rule: Eligibility = {
    everyone: everyone || undefined,
    birthYearFrom: year(yearFrom),
    birthYearTo: year(yearTo),
    groups,
    attendedEventIds: attended,
    childIds,
  };
  const ruleKey = JSON.stringify(rule);

  // Live count of eligible children, for the rule as currently edited.
  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/events/${eventId}/portal-eligibility`, { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"eligibility":${ruleKey}}` })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setEligible(d?.eligible ?? null))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [eventId, ruleKey]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalOpen: open, eligibility: rule, autoAccept, location, portalInfo, paymentDocTypeId: paymentDocTypeId || null }),
    });
    setSaving(false);
    setMessage(res.ok ? t("portalSettings.saved") : t("registrationSettings.saveFailed"));
    if (res.ok) onSaved();
  }

  function addChild() {
    const c = options?.children.find((o) => childLabel(o) === childPick);
    if (!c) return setMessage(t("children.pickFromList"));
    setChildIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
    setChildPick("");
  }

  const pastDeadline = event.registrationDeadline != null && event.registrationDeadline.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-6 flex max-w-md flex-col gap-3 border-t border-mist pt-4">
      <h4 className="text-[14px] font-semibold text-ink">{t("portalSettings.title")}</h4>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="h-4 w-4 accent-ember" />
        {t("portalSettings.open")}
      </label>
      <span className="-mt-2 text-[11.5px] text-ink-secondary">{t("portalSettings.openHint")}</span>
      {pastDeadline && <span className="text-[12px] text-amber-700">{t("portalSettings.pastDeadline")}</span>}

      <label className="text-[13px] text-ink-secondary">
        {t("portalCard.location")}
        <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass + " mt-1"} />
      </label>
      <label className="text-[13px] text-ink-secondary">
        {t("portalCard.info")}
        <textarea value={portalInfo} onChange={(e) => setPortalInfo(e.target.value)} rows={3} className={inputClass + " mt-1"} />
      </label>
      <label className="text-[13px] text-ink-secondary">
        {t("paymentDoc.label")}
        <select value={paymentDocTypeId} onChange={(e) => setPaymentDocTypeId(e.target.value)} className={inputClass + " mt-1"}>
          <option value="">{t("paymentDoc.none")}</option>
          {docTypes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11.5px]">{t("paymentDoc.hint")}</span>
      </label>

      <label className="text-[13px] text-ink-secondary">
        {t("autoAccept.label")}
        <select value={autoAccept} onChange={(e) => setAutoAccept(e.target.value as AutoAcceptMode)} className={inputClass + " mt-1"}>
          <option value="manual">{t("autoAccept.manual")}</option>
          <option value="accept">{t("autoAccept.accept")}</option>
          <option value="accept_send">{t("autoAccept.acceptSend")}</option>
        </select>
        <span className="mt-1 block text-[11.5px]">{t("autoAccept.hint")}</span>
      </label>
      {autoAccept === "accept_send" && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">{t("autoAccept.sendWarning")}</p>}
      {event.autoAccept === "accept_send" && event.autoSendReady === false && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{t("autoAccept.noSender")}</p>
      )}

      <p className="text-[13px] font-medium text-ink">{t("portalSettings.whoTitle")}</p>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
        {t("portalSettings.everyone")}
      </label>
      {!everyone && (
        <>
          <p className="text-[11.5px] text-ink-secondary">{t("portalSettings.criteriaHint")}</p>
          <div className="flex gap-2">
            <label className="flex-1 text-[13px] text-ink-secondary">
              {t("portalSettings.birthYearFrom")}
              <input inputMode="numeric" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2012" className={inputClass + " mt-1"} />
            </label>
            <label className="flex-1 text-[13px] text-ink-secondary">
              {t("portalSettings.birthYearTo")}
              <input inputMode="numeric" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2016" className={inputClass + " mt-1"} />
            </label>
          </div>
          {options && options.groups.length > 0 && (
            <div className="text-[13px] text-ink-secondary">
              {t("portalSettings.groups")}
              <div className={box + " mt-1"}>
                {options.groups.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-ink">
                    <input type="checkbox" checked={groups.includes(g)} onChange={() => setGroups((p) => toggle(p, g))} />
                    {g}
                  </label>
                ))}
              </div>
            </div>
          )}
          {options && options.events.length > 0 && (
            <div className="text-[13px] text-ink-secondary">
              {t("portalSettings.attended")}
              <div className={box + " mt-1"}>
                {options.events.map((ev) => (
                  <label key={ev.id} className="flex items-center gap-2 text-ink">
                    <input type="checkbox" checked={attended.includes(ev.id)} onChange={() => setAttended((p) => toggle(p, ev.id))} />
                    {ev.kind === "membership" ? t("children.membershipChip", { year: String(ev.membershipYear ?? "?") }) : ev.name}
                    <span className="text-[12px] text-ink-secondary">{date(ev.startDate)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="text-[13px] text-ink-secondary">
        {t("portalSettings.children")}
        <div className="mt-1 flex gap-2">
          <input list="portal-children" value={childPick} onChange={(e) => setChildPick(e.target.value)} placeholder={t("children.linkPlaceholder")} className={inputClass} />
          <datalist id="portal-children">
            {options?.children.map((c) => (
              <option key={c.id} value={childLabel(c)} />
            ))}
          </datalist>
          <button type="button" onClick={addChild} className="rounded-lg border border-mist px-3 text-[13px] text-ink hover:bg-paper-2">
            {t("portalSettings.add")}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {childIds.map((id) => {
            const c = options?.children.find((o) => o.id === id);
            return (
              <span key={id} className="rounded bg-paper-2 px-1.5 py-0.5 text-[12px] text-ink">
                {c ? c.name : id}
                <button type="button" aria-label={t("common.delete")} onClick={() => setChildIds((p) => p.filter((x) => x !== id))} className="ml-1 text-ink-secondary hover:text-red-600">
                  ×
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {eligible && (
        <details className="rounded-lg border border-mist bg-paper-2 p-2 text-[13px]">
          <summary className="cursor-pointer text-ink">{t("portalSettings.eligibleCount", { count: String(eligible.length) })}</summary>
          <ul className="scrollbar-app mt-1 max-h-48 overflow-y-auto text-ink-secondary">
            {eligible.map((c) => (
              <li key={c.id}>{childLabel(c)}</li>
            ))}
          </ul>
        </details>
      )}
      {message && <p className="text-[13px] text-ink">{message}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
