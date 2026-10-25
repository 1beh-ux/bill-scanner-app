"use client";

import { useCallback, useEffect, useState } from "react";
import { OrgFooter, OrgName, type PublicOrg } from "@/components/registration/OrgBrand";
import ThemeToggle from "@/components/registration/ThemeToggle";
import { useEmbed } from "@/components/embed/PublicFrame";
import { portalApiFetch, postScrollTop } from "@/components/embed/embed-client";
import { Gate, RegistrationCard, type EventRef, type Registration } from "../../p/[token]/PortalApp";

// A participant's own page for one event (src/lib/participant-link.ts): the parent portal's birth-date
// gate and registration card (payment + bank check, documents, re-send, "Doplňte údaje") -- only this
// registration, no profile, no other events.
type Data = { name: string; registration: Registration };

export default function ParticipantApp({ token, org, strings }: { token: string; org: PublicOrg; strings: Record<string, string> }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = strings[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
      return s;
    },
    [strings]
  );
  const embed = useEmbed();
  const api = `/api/public/u/${token}`;
  const [phase, setPhase] = useState<"loading" | "gate" | "ready" | "unavailable">("loading");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const res = await portalApiFetch(api, { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) return setPhase("gate");
    if (!res?.ok) return setPhase("unavailable");
    setData(await res.json());
    setPhase("ready");
  }, [api]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load, as in the portal
    load();
  }, [load]);
  useEffect(() => {
    if (embed && phase !== "loading") postScrollTop();
  }, [embed, phase]);

  const evName = (e: EventRef) => (e.kind === "membership" ? t("portal.membership", { year: String(e.membershipYear ?? "") }) : e.name);

  return (
    <div className="pub-container mx-auto w-full max-w-3xl p-4 pb-16">
      <ThemeToggle label={t("portal.toggleTheme")} />
      <OrgName org={org} />
      <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("participantPage.gateTitle")}</p>
      {phase === "loading" && <p className="mt-6 text-[14px] text-ink-secondary">{t("portal.loading")}</p>}
      {phase === "unavailable" && <p className="mt-6 text-[15px] text-ink">{t("portal.unavailable")}</p>}
      {phase === "gate" && <Gate api={api} t={t} onPassed={load} />}
      {phase === "ready" && data && (
        <>
          <h1 className="mb-5 mt-1 text-[24px] font-semibold text-ink">{data.name}</h1>
          {/* Keyed by state: a page that becomes complete folds its "Podrobnosti" like the portal does on load. */}
          <RegistrationCard key={data.registration.state} api={api} r={data.registration} who={null} t={t} evName={evName} onChanged={load} />
        </>
      )}
      <OrgFooter org={org} label={t("portal.contact")} />
    </div>
  );
}
