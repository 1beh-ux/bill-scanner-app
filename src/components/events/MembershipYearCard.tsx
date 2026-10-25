"use client";

import { useEffect, useState } from "react";

// Nastavení akce -> Akce: which membership year this event checks (price, VS digit, "Členství (rok akce)",
// "Je členem" in lists and documents). Empty = the calendar year the event starts in (src/lib/children.ts).
type T = (key: string, vars?: Record<string, string>) => string;
type Ev = { id: string; name: string; kind: string; membershipYear: number | null };
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function MembershipYearCard({ event, onSaved, t }: { event: { id: string; startDate: string; membershipCheckYear: number | null; registrationConnected: boolean }; onSaved: () => void; t: T }) {
  const [years, setYears] = useState<Ev[]>([]);
  const [value, setValue] = useState(event.membershipCheckYear == null ? "" : String(event.membershipCheckYear));
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  const startYear = new Date(event.startDate).getUTCFullYear();

  useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Ev[]) => setYears(list.filter((e) => e.kind === "membership" && e.membershipYear != null).sort((a, b) => a.membershipYear! - b.membershipYear!)))
      .catch(() => {});
  }, []);

  async function save(v: string) {
    setValue(v);
    setState("idle");
    const res = await fetch(`/api/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipCheckYear: v ? Number(v) : null }) }).catch(() => null);
    setState(res?.ok ? "saved" : "failed");
    if (res?.ok) onSaved();
  }

  const used = value ? Number(value) : startYear;
  const source = years.filter((e) => e.membershipYear === used);
  return (
    <div>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("membershipYear.title")}</h3>
      <p className="mb-3 max-w-md text-[12.5px] text-ink-secondary">{t("membershipYear.hint")}</p>
      <label className="flex max-w-md flex-col text-[13px] text-ink-secondary">
        {t("membershipYear.label")}
        <select value={value} onChange={(e) => save(e.target.value)} className={inputClass + " mt-1"}>
          <option value="">{t("membershipYear.auto", { year: String(startYear) })}</option>
          {[...new Set([...years.map((e) => e.membershipYear!), startYear - 1, startYear, startYear + 1])].sort().map((y) => (
            <option key={y} value={String(y)}>
              {y}
              {years.some((e) => e.membershipYear === y) ? ` – ${years.filter((e) => e.membershipYear === y).map((e) => e.name).join(", ")}` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 max-w-md text-[12px] text-ink-secondary">
        {source.length ? t("membershipYear.source", { year: String(used), events: source.map((e) => e.name).join(", ") }) : t("membershipYear.noSource", { year: String(used) })}
      </p>
      {!event.registrationConnected && <p className="mt-1 max-w-md text-[12px] text-amber-700">{t("membershipYear.notConnected")}</p>}
      {state === "saved" && <p className="mt-1 text-[12.5px] text-pine">{t("appearance.saved")}</p>}
      {state === "failed" && <p className="mt-1 text-[12.5px] text-red-600">{t("registrationSettings.saveFailed")}</p>}
    </div>
  );
}
