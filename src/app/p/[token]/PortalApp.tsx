"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { MarkdownText } from "@/components/registration/Markdown";
import { toBoolean } from "@/lib/participant-fields";
import { previewPrices, type PriceRules } from "@/lib/price-rules";
import FieldInput, { portalInputClass as inputClass } from "@/components/registration/FieldInput";
import PersonPrice, { type CategoryOption, type OddilField } from "@/components/registration/PersonPrice";
import { REGISTRATION_STATES, type RegistrationState } from "@/lib/registration-status";

// The parent portal UI (docs/registration-portal-spec.md G, portal v2:
// docs/registration-slice3-spec.md F). Two columns on desktop -- the person /
// family on the left, registrations on the right -- one column on a phone.
// Data from /api/portal/<token> (src/lib/portal-server.ts); every request
// carries the birth-date cookie.
type Access = "edit" | "approval" | "read" | "hidden";
// level (slice 5 #4): basic = on the profile, detailed = the "Podrobné údaje" sub-screen.
// requiredBy: the name of an upcoming registration's event that requires this field.
type Field = { key: string; label: string; access: Access; fieldType: string; options: unknown; value: string; pending: string | null; level: "basic" | "detailed"; requiredBy: string | null };
type Guardian = { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean };
type EventRef = { name: string; startDate: string; endDate: string; kind: "event" | "membership"; membershipYear: number | null };
type DocFile = { id: string | null; date: string } | null;
type CardSection = { kind: "event" | "status" | "category" | "documents" | "resend" | "payment" | "fields"; title?: string | null; items?: { label: string; value: string }[] };
type Registration = {
  participantId: string;
  event: EventRef & { location: string | null; info: string | null };
  status: "pending" | "accepted";
  // Status filter (slice 4 #3, src/lib/registration-status.ts).
  state: RegistrationState;
  note: string | null;
  category: string | null;
  // paid: null = the event has no payment document type (slice 4 #5).
  payment: { priceCzk: number | null; account: string | null; variableSymbol: string; qrDataUrl: string | null; paid: boolean | null } | null;
  // fromProfile: received through the person's permanent document (slice 6 #4).
  documents: { typeId: string; name: string; sent: DocFile; received: DocFile; fromProfile: { event: string | null } | null; review: "pending" | "rejected" | null; reviewNote: string | null; canUpload: boolean }[];
  resend: { left: number } | null;
  sections: CardSection[];
};
// One person of the link (a child link has one, a family link every member).
type Member = {
  id: string;
  name: string;
  isAdult: boolean;
  profile: { fields: Field[]; guardians: Guardian[]; guardiansPending: Guardian[] | null };
  registrations: Registration[];
  history: (EventRef & { id: string; status: "pending" | "accepted" })[];
};
// For the live price of a registration (src/lib/portal-server.ts registrationPricing).
type Pricing = {
  rules: PriceRules | null;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
  eventStart: string;
  alreadyRegistered: number;
  inFamily: boolean;
  oddil: OddilField | null;
  members: { id: string; isAdult: boolean; isMember: boolean; categories: CategoryOption[] }[];
};
// The registration step (slice 5 #3): the event's required fields for one person.
type StepField = { key: string; label: string; fieldType: string; options: unknown; source: "profile" | "event"; access: "edit" | "approval" | null; value: string };
type Step = { fields: StepField[]; reviewTick: boolean };
type Data = {
  kind: "child" | "family";
  name: string;
  members: Member[];
  contacts: { name: string | null; email: string; phone: string | null; member: string | null }[];
  available: (EventRef & { id: string; registrationDeadline: string | null; memberIds: string[]; pricing: Pricing; steps: Record<string, Step> })[];
};
type T = (key: string, vars?: Record<string, string>) => string;

const btnPrimary = "rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist px-3 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const card = "rounded-lg border border-mist bg-paper p-4";
const h2 = "text-[13px] font-semibold uppercase tracking-wide text-ink-secondary";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const chip = (on: boolean) => "rounded-full border px-3 py-1 text-[14px] " + (on ? "border-ember bg-ember/15 text-ink" : "border-mist text-ink-secondary hover:text-ink");
const range = (e: { startDate: string; endDate: string }) => (date(e.startDate) === date(e.endDate) ? date(e.startDate) : `${date(e.startDate)} – ${date(e.endDate)}`);

export default function PortalApp({ token, strings }: { token: string; strings: Record<string, string> }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = strings[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
      return s;
    },
    [strings]
  );
  const api = `/api/portal/${token}`;
  const [phase, setPhase] = useState<"loading" | "gate" | "ready" | "unavailable">("loading");
  const [data, setData] = useState<Data | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  // Family link: a picked member also filters "Moje přihlášky" (slice 4 #1); "Všichni" shows all.
  const [onlyMember, setOnlyMember] = useState(false);
  const [stateFilter, setStateFilter] = useState<RegistrationState | "all">("all");
  // Shown after a portal registration (slice 4 #10): pending / accepted / accepted + sent.
  const [registered, setRegistered] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) return setPhase("gate");
    if (!res?.ok) return setPhase("unavailable");
    setData(await res.json());
    setPhase("ready");
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const evName = (e: EventRef) => (e.kind === "membership" ? t("portal.membership", { year: String(e.membershipYear ?? "") }) : e.name);
  const member = data ? (data.members.find((m) => m.id === memberId) ?? data.members[0]) : null;
  const many = (data?.members.length ?? 0) > 1;
  const shown = data && member ? data.members.filter((m) => !onlyMember || m.id === member.id) : [];
  const shownRegs = shown.flatMap((m) => m.registrations.map((r) => ({ m, r })));

  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-16">
      <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("portal.title")}</p>
      {phase === "loading" && <p className="mt-6 text-[14px] text-ink-secondary">{t("portal.loading")}</p>}
      {phase === "unavailable" && <p className="mt-6 text-[15px] text-ink">{t("portal.unavailable")}</p>}
      {phase === "gate" && <Gate api={api} t={t} onPassed={load} />}
      {phase === "ready" && data && member && (
        <>
          <h1 className="mb-5 mt-1 text-[24px] font-semibold text-ink">{data.name}</h1>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex flex-col gap-4">
              {many && (
                <section className={card + " flex flex-col gap-3"}>
                  <h2 className={h2}>{t("portal.family")}</h2>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setOnlyMember(false)} className={chip(!onlyMember)}>
                      {t("portal.everyone")}
                    </button>
                    {data.members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setMemberId(m.id);
                          setOnlyMember(true);
                        }}
                        className={chip(onlyMember && m.id === member.id)}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                  {data.contacts.length > 0 && (
                    <p className="text-[13px] text-ink-secondary [overflow-wrap:anywhere]">
                      {t("portal.contacts")}: {data.contacts.map((c) => (c.member ? `${c.member} (${c.email})` : c.name ? `${c.name} (${c.email})` : c.email)).join(", ")}
                    </p>
                  )}
                </section>
              )}
              <h2 className={h2}>{t("portal.profileOf", { name: member.name })}</h2>
              <Profile key={member.id} api={api} member={member} t={t} onSaved={load} />
            </div>

            <div className="flex flex-col gap-4">
              {data.available.length > 0 && (
                <>
                  <h2 className={h2}>{t("portal.tab.events")}</h2>
                  <Available
                    api={api}
                    data={data}
                    t={t}
                    evName={evName}
                    onRegistered={(message) => {
                      setRegistered(message);
                      load();
                    }}
                  />
                </>
              )}
              {registered && <p className="rounded-lg border border-pine/40 bg-pine/10 px-3 py-2 text-[14px] text-pine">{registered}</p>}
              <h2 className={h2}>{t("portal.tab.registrations")}</h2>
              {shownRegs.length === 0 && <p className="text-[14px] text-ink-secondary">{t("portal.noRegistrations")}</p>}
              {shownRegs.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("portal.stateFilter")}>
                  {(["all", ...REGISTRATION_STATES] as const).map((st) => (
                    <button key={st} onClick={() => setStateFilter(st)} className={chip(stateFilter === st)}>
                      {t(`portal.state.${st}`)} ({st === "all" ? shownRegs.length : shownRegs.filter((x) => x.r.state === st).length})
                    </button>
                  ))}
                </div>
              )}
              {shownRegs
                .filter((x) => stateFilter === "all" || x.r.state === stateFilter)
                .map(({ m, r }) => (
                  <RegistrationCard key={r.participantId} api={api} r={r} who={many ? m.name : null} t={t} evName={evName} onChanged={load} />
                ))}
              {shown.some((m) => m.history.length > 0) && (
                <details className={card}>
                  <summary className="cursor-pointer text-[14px] font-medium text-ink">{t("portal.tab.history")}</summary>
                  <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
                    {shown.flatMap((m) =>
                      m.history.map((h) => (
                        <li key={h.id} className="flex flex-wrap justify-between gap-2">
                          <span className="text-ink">
                            {evName(h)}
                            {many && <span className="text-ink-secondary"> · {m.name}</span>}
                          </span>
                          <span className="text-ink-secondary">{range(h)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Gate({ api, t, onPassed }: { api: string; t: T; onPassed: () => void }) {
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`${api}/gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ birthDate }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) return onPassed();
    setError(t(res?.status === 429 ? "portal.gateThrottled" : res?.status === 403 ? "portal.gateWrong" : "portal.unavailable"));
  }
  return (
    <form onSubmit={submit} className={card + " mx-auto mt-6 flex max-w-md flex-col gap-3"}>
      <h1 className="text-[20px] font-semibold text-ink">{t("portal.gateTitle")}</h1>
      <p className="text-[14px] text-ink-secondary">{t("portal.gateHint")}</p>
      <input type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputClass} aria-label={t("portal.gateLabel")} />
      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !birthDate} className={btnPrimary}>
        {t("portal.gateSubmit")}
      </button>
    </form>
  );
}

function Profile({ api, member, t, onSaved }: { api: string; member: Member; t: T; onSaved: () => void }) {
  const fields = member.profile.fields;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.pending ?? f.value])));
  const [guardians, setGuardians] = useState<Guardian[]>(member.profile.guardiansPending ?? member.profile.guardians);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // "Podrobné údaje" sub-screen (slice 5 #4).
  const [detailed, setDetailed] = useState(false);
  const detailedFields = fields.filter((f) => f.level === "detailed");
  // Required by an upcoming registration and still empty -> highlighted.
  const missing = (f: Field) => !!f.requiredBy && !(f.pending ?? f.value).trim();
  const missingDetailed = detailedFields.filter(missing).length;

  async function patch(body: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${api}/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, memberId: member.id }) }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "portal.saved" : "portal.saveFailed"));
    if (res?.ok) onSaved();
  }
  function saveFields() {
    // Only what changed against what's shown (live value, or the pending one).
    const changed = Object.fromEntries(fields.filter((f) => (f.access === "edit" || f.access === "approval") && values[f.key] !== (f.pending ?? f.value)).map((f) => [f.key, values[f.key]]));
    if (Object.keys(changed).length) patch({ values: changed });
  }
  const show = (f: Field, v: string) => {
    if (!v) return "—";
    if (f.fieldType === "boolean") return toBoolean(v, f.options) === "true" ? t("portal.yes") : toBoolean(v, f.options) === "false" ? t("portal.no") : v;
    if (f.fieldType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return date(v);
    return v;
  };

  return (
    <div className="flex flex-col gap-4">
      <section className={card + " flex flex-col gap-3"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold text-ink">{t(detailed ? "portal.detailedTitle" : "portal.basicTitle")}</h3>
          {(detailed || detailedFields.length > 0) && (
            <button type="button" onClick={() => setDetailed(!detailed)} className={btn}>
              {detailed ? t("portal.backToBasic") : t("portal.openDetailed")}
              {!detailed && missingDetailed > 0 && <span className="ml-1.5 text-amber-700">({t("portal.detailedMissing", { n: String(missingDetailed) })})</span>}
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-secondary">{t(detailed ? "portal.detailedHint" : "portal.profileHint")}</p>
        {fields.filter((f) => (f.level === "detailed") === detailed).map((f) => {
          const editable = f.access === "edit" || f.access === "approval";
          return (
            <div key={f.key} className={"flex flex-col gap-1 " + (missing(f) ? "rounded-lg border border-amber-500/70 bg-amber-500/10 p-2" : "")}>
              <span className="text-[13px] text-ink-secondary">
                {f.label}
                {f.access === "approval" && <span className="ml-1.5 text-[11.5px]">({t("portal.needsApproval")})</span>}
              </span>
              {editable ? (
                <FieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} yesLabel={t("portal.yes")} />
              ) : (
                <span className="text-[15px] text-ink">{show(f, f.value)}</span>
              )}
              {f.pending !== null && <span className="text-[12.5px] text-amber-700">{t("portal.pendingApproval", { value: show(f, f.pending), old: show(f, f.value) })}</span>}
              {missing(f) && <span className="text-[12.5px] text-amber-700">{t("portal.requiredBy", { event: f.requiredBy! })}</span>}
            </div>
          );
        })}
        {message && <p className="text-[14px] text-ink">{message}</p>}
        <button onClick={saveFields} disabled={busy} className={btnPrimary}>
          {t("portal.save")}
        </button>
      </section>

      <section className={card + " flex flex-col gap-3"}>
        <h3 className="text-[16px] font-semibold text-ink">{t("portal.guardians")}</h3>
        <p className="text-[13px] text-ink-secondary">
          {member.profile.guardiansPending
            ? t("portal.guardiansPending", { current: member.profile.guardians.map((g) => g.email).join(", ") || "—" })
            : t("portal.guardiansApprovalHint")}
        </p>
        {guardians.map((g, i) => {
          const set = (p: Partial<Guardian>) => setGuardians((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-mist p-3">
              <input placeholder={t("portal.guardianName")} value={g.name ?? ""} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
              <input type="email" placeholder={t("portal.guardianEmail")} value={g.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} />
              <input placeholder={t("portal.guardianRelationship")} value={g.relationship ?? ""} onChange={(e) => set({ relationship: e.target.value })} className={inputClass} />
              <input type="tel" placeholder={t("portal.guardianPhone")} value={g.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className={inputClass} />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[14px] text-ink">
                  <input type="checkbox" checked={g.receivesCommunications} onChange={(e) => set({ receivesCommunications: e.target.checked })} />
                  {t("portal.guardianReceives")}
                </label>
                {guardians.length > 1 && (
                  <button type="button" onClick={() => setGuardians((prev) => prev.filter((_, j) => j !== i))} className="text-[14px] text-red-600">
                    {t("portal.remove")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setGuardians((p) => [...p, { name: "", email: "", relationship: "", phone: "", receivesCommunications: true }])} className={btn}>
            {t("portal.addGuardian")}
          </button>
          <button type="button" onClick={() => patch({ guardians: guardians.filter((g) => g.email.trim()) })} disabled={busy} className={btn}>
            {t("portal.saveGuardians")}
          </button>
        </div>
      </section>
    </div>
  );
}

// Register (or renew a membership) for an open event: pick who, a category
// per person, the live price incl. the household discount, confirm.
function Available({ api, data, t, evName, onRegistered }: { api: string; data: Data; t: T; evName: (e: EventRef) => string; onRegistered: (message: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [choice, setChoice] = useState<Record<string, { category?: string; oddil?: string }>>({});
  // Registration step (slice 5 #3): answers + "Údaje jsou aktuální" per person.
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberOf = (id: string) => data.members.find((m) => m.id === id)!;
  const value = (m: Member, key: string) => m.profile.fields.find((f) => f.key === key)?.value || "";

  async function register(eventId: string) {
    setBusy(true);
    setError(null);
    const picks = picked.map((memberId) => ({ memberId, priceCategory: choice[memberId]?.category, oddil: choice[memberId]?.oddil, answers: answers[memberId], reviewed: reviewed[memberId] }));
    const res = await fetch(`${api}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, picks, note }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t(res?.status === 400 ? "portal.stepIncomplete" : "portal.registerFailed"));
    // The parent already has this link: only the status (slice 4 #10).
    const { outcome } = await res.json().catch(() => ({ outcome: null }));
    setOpenId(null);
    setNote("");
    onRegistered(t(outcome === "accepted_sent" ? "portal.registeredSent" : outcome === "accepted" ? "portal.registeredAccepted" : "portal.registeredPending"));
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.available.map((e) => {
        const pm = (id: string) => e.pricing.members.find((x) => x.id === id)!;
        const prices = previewPrices(
          { ...e.pricing, eventStart: new Date(e.pricing.eventStart) },
          picked.map((id) => ({ category: choice[id]?.category ?? pm(id)?.categories[0]?.key, isAdult: pm(id)?.isAdult ?? false, isMember: pm(id)?.isMember ?? false }))
        );
        const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);
        const renew = e.kind === "membership" && data.members.some((m) => m.history.some((h) => h.kind === "membership"));
        // Every picked person's required fields filled (an Ano/Ne box is always an answer) and the tick where needed.
        const stepDone = picked.every((id) => {
          const step = e.steps[id];
          return !step || (step.fields.every((f) => f.fieldType === "boolean" || answers[id]?.[f.key]?.trim()) && (!step.reviewTick || reviewed[id]));
        });
        return (
          <li key={e.id} className={card + " flex flex-col gap-3"}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[16px] font-semibold text-ink">{evName(e)}</span>
              <span className="text-[13px] text-ink-secondary">{range(e)}</span>
            </div>
            {e.registrationDeadline && <span className="text-[13px] text-ink-secondary">{t("portal.deadline", { date: date(e.registrationDeadline) })}</span>}
            {openId !== e.id ? (
              <button
                onClick={() => {
                  setOpenId(e.id);
                  setPicked(e.memberIds);
                  setChoice({});
                  setAnswers(Object.fromEntries(e.memberIds.map((id) => [id, Object.fromEntries((e.steps[id]?.fields ?? []).map((f) => [f.key, f.value]))])));
                  setReviewed({});
                  setError(null);
                }}
                className={btnPrimary}
              >
                {t(renew ? "portal.renew" : "portal.register")}
              </button>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg bg-paper-2 p-3">
                <p className="text-[13px] text-ink-secondary">{t("portal.reviewHint")}</p>
                {e.memberIds.map((id) => {
                  const m = memberOf(id);
                  const on = picked.includes(id);
                  return (
                    <div key={id} className="flex flex-col gap-2 rounded-lg border border-mist bg-paper p-2 text-[14px]">
                      <label className="flex items-start gap-2">
                        {e.memberIds.length > 1 && (
                          <input type="checkbox" className="mt-1" checked={on} onChange={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
                        )}
                        <span className="flex flex-col">
                          <span className="text-ink">
                            {[value(m, "participant_first_name"), value(m, "participant_last_name")].join(" ").trim() || m.name} · {date(value(m, "datum_narozeni") || null)}
                          </span>
                          <span className="text-[13px] text-ink-secondary [overflow-wrap:anywhere]">
                            {t("portal.guardians")}: {m.profile.guardians.map((g) => g.email).join(", ") || "—"}
                          </span>
                        </span>
                      </label>
                      {on && (
                        <PersonPrice
                          categories={pm(id).categories}
                          category={choice[id]?.category}
                          onCategory={(category) => setChoice((c) => ({ ...c, [id]: { ...c[id], category } }))}
                          oddil={e.pricing.oddil}
                          oddilValue={choice[id]?.oddil}
                          onOddil={(oddil) => setChoice((c) => ({ ...c, [id]: { ...c[id], oddil } }))}
                          price={prices[picked.indexOf(id)]}
                          t={t}
                        />
                      )}
                      {on && e.steps[id] && e.steps[id].fields.length > 0 && (
                        <RegistrationStep
                          step={e.steps[id]}
                          values={answers[id] ?? {}}
                          onChange={(key, v) => setAnswers((a) => ({ ...a, [id]: { ...a[id], [key]: v } }))}
                          reviewed={!!reviewed[id]}
                          onReviewed={(v) => setReviewed((r) => ({ ...r, [id]: v }))}
                          t={t}
                        />
                      )}
                    </div>
                  );
                })}
                {picked.length > 1 && <p className="text-[14px] font-medium text-ink">{t("portal.total", { price: String(total) })}</p>}
                <label className="text-[13px] text-ink-secondary">
                  {t("portal.note")}
                  <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} maxLength={2000} className={inputClass + " mt-1"} />
                </label>
                {error && <p className="text-[14px] text-red-600">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => register(e.id)} disabled={busy || picked.length === 0 || !stepDone} className={btnPrimary}>
                    {t("portal.registerConfirm")}
                  </button>
                  <button onClick={() => setOpenId(null)} disabled={busy} className={btn}>
                    {t("portal.cancel")}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The event's required fields for one person (slice 5 #3): profile fields
// pre-filled (saved back to the profile by their rule), event questions empty,
// and "Údaje jsou aktuální" when detailed data came pre-filled.
function RegistrationStep({ step, values, onChange, reviewed, onReviewed, t }: { step: Step; values: Record<string, string>; onChange: (key: string, v: string) => void; reviewed: boolean; onReviewed: (v: boolean) => void; t: T }) {
  return (
    <div className="flex flex-col gap-2 border-t border-mist pt-2">
      <p className="text-[13px] font-medium text-ink">{t("portal.stepTitle")}</p>
      {step.fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-[13px] text-ink-secondary">
          <span>
            {f.label}
            {f.fieldType !== "boolean" && " *"}
            {f.access === "approval" && <span className="ml-1.5 text-[11.5px]">({t("portal.needsApproval")})</span>}
          </span>
          <FieldInput field={f} value={values[f.key] ?? ""} required={f.fieldType !== "boolean"} onChange={(v) => onChange(f.key, v)} yesLabel={t("portal.yes")} />
        </label>
      ))}
      {step.fields.some((f) => f.source === "profile") && <p className="text-[12px] text-ink-secondary">{t("portal.stepSavedToProfile")}</p>}
      {step.reviewTick && (
        <label className="flex items-start gap-2 text-[14px] text-ink">
          <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => onReviewed(e.target.checked)} />
          {t("portal.stepReviewed")}
        </label>
      )}
    </div>
  );
}

// One registration, its blocks in the event's card layout (src/lib/participant-layout.ts "portal").
function RegistrationCard({ api, r, who, t, evName, onChanged }: { api: string; r: Registration; who: string | null; t: T; evName: (e: EventRef) => string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${api}/resend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: r.participantId }) }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "portal.resendDone" : res?.status === 429 ? "portal.resendLimit" : "portal.resendFailed"));
    if (res?.ok) onChanged();
  }

  async function upload(typeId: string, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set("participantId", r.participantId);
    form.set("docTypeId", typeId);
    form.set("file", file);
    const res = await fetch(`${api}/upload`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "portal.uploadDone" : res?.status === 400 ? "portal.uploadBadFile" : "portal.uploadFailed"));
    if (res?.ok) onChanged();
  }

  const fileLink = (f: DocFile, label: string) =>
    f &&
    (f.id ? (
      <a href={`${api}/documents/${f.id}`} className="text-ember underline">
        {label} {date(f.date)}
      </a>
    ) : (
      <span className="text-ink-secondary">
        {label} {date(f.date)}
      </span>
    ));

  const block = (s: CardSection, i: number) => {
    switch (s.kind) {
      case "event":
        return (
          <div key={i} className="flex flex-col gap-1 text-[13px] text-ink-secondary">
            <span>{range(r.event)}</span>
            {r.event.location && <span>{t("portal.location", { place: r.event.location })}</span>}
            {r.event.info && <EventInfo text={r.event.info} t={t} />}
            {r.note && <span>{t("portal.yourNote", { note: r.note })}</span>}
          </div>
        );
      case "status":
        return (
          <span key={i} className={"self-start rounded-full px-2.5 py-0.5 text-[13px] " + (r.status === "accepted" ? "bg-pine/15 text-pine" : "bg-ember/15 text-ember")}>
            {t(r.status === "accepted" ? "portal.statusAccepted" : "portal.statusPending")}
          </span>
        );
      case "category":
        return r.category ? (
          <p key={i} className="text-[14px] text-ink">
            {t("portal.priceCategory")}: {r.category}
          </p>
        ) : null;
      case "documents":
        return r.documents.length > 0 ? (
          <div key={i} className="flex flex-col gap-2 text-[14px]">
            <p className="font-medium text-ink">{t("portal.documents")}</p>
            {r.documents.map((d) => (
              <div key={d.typeId} className="flex flex-col gap-1 rounded-lg border border-mist p-2">
                <span className="text-ink">{d.name}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                  {fileLink(d.sent, t("portal.docSent"))}
                  {fileLink(d.received, d.fromProfile ? (d.fromProfile.event ? t("portal.docFromProfileEvent", { event: d.fromProfile.event }) : t("portal.docFromProfile")) : t("portal.docReceived"))}
                  {d.review === "pending" && <span className="text-amber-700">{t("portal.docInReview")}</span>}
                  {d.review === "rejected" && <span className="text-red-700">{t("portal.docRejected", { note: d.reviewNote ?? "" })}</span>}
                  {!d.received && !d.review && <span className="text-amber-700">{t("portal.docMissing")}</span>}
                </span>
                {d.canUpload && (
                  // A filled accent button (slice 4 #2) -- the bare file input got lost on the card.
                  <label
                    className={
                      "mt-1 inline-flex cursor-pointer items-center gap-2 self-start rounded-lg bg-ember px-3.5 py-2 text-[14px] font-medium text-white hover:bg-ember-hover focus-within:ring-2 focus-within:ring-ember focus-within:ring-offset-2 " +
                      (busy ? "pointer-events-none opacity-50" : "")
                    }
                  >
                    <Upload size={16} aria-hidden="true" />
                    {t(d.received || d.review ? "portal.uploadAgain" : "portal.upload")}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      disabled={busy}
                      onChange={(e) => {
                        upload(d.typeId, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="sr-only"
                    />
                  </label>
                )}
                {d.canUpload && <span className="text-[12px] text-ink-secondary">{t("portal.uploadHint")}</span>}
              </div>
            ))}
          </div>
        ) : null;
      case "resend":
        return r.resend ? (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <button onClick={resend} disabled={busy || r.resend.left === 0} className={btn}>
              {t("portal.resend")}
            </button>
            <span className="text-[12.5px] text-ink-secondary">{r.resend.left === 0 ? t("portal.resendLimit") : t("portal.resendHint", { left: String(r.resend.left) })}</span>
          </div>
        ) : null;
      case "payment":
        return r.payment ? (
          <div key={i} className="flex flex-col gap-1 rounded-lg bg-paper-2 p-3 text-[14px]">
            <p className="font-medium text-ink">{t("portal.payment")}</p>
            {r.payment.paid === true && <p className="self-start rounded-full bg-pine/15 px-2.5 py-0.5 text-[13px] text-pine">{t("portal.paid")}</p>}
            {r.payment.paid === false && (
              <>
                <p className="self-start rounded-full bg-ember/15 px-2.5 py-0.5 text-[13px] text-ember">{t("portal.awaitingPayment")}</p>
                <p className="text-[12.5px] text-ink-secondary">{t("portal.paymentDelayNote")}</p>
              </>
            )}
            {r.payment.priceCzk != null && <p>{t("portal.price", { price: String(r.payment.priceCzk) })}</p>}
            {r.payment.account && <p>{t("portal.account", { account: r.payment.account })}</p>}
            {r.payment.variableSymbol && <p>{t("portal.vs", { vs: r.payment.variableSymbol })}</p>}
            {r.payment.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing to optimise
              <img src={r.payment.qrDataUrl} alt={t("portal.qrAlt")} className="mt-2 h-44 w-44 self-start rounded bg-white p-1" />
            )}
          </div>
        ) : null;
      case "fields":
        return s.items?.length ? (
          <div key={i} className="flex flex-col gap-1 text-[14px]">
            {s.title && <p className="font-medium text-ink">{s.title}</p>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {s.items.map((it) => (
                <div key={it.label} className="contents">
                  <dt className="text-ink-secondary">{it.label}</dt>
                  <dd className="text-ink [overflow-wrap:anywhere]">{it.value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null;
    }
  };

  return (
    <section className={card + " flex flex-col gap-3"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[16px] font-semibold text-ink">{evName(r.event)}</span>
        {who && <span className="text-[13px] text-ink-secondary">{who}</span>}
      </div>
      {r.sections.map(block)}
      {message && <p className="text-[13px] text-ink">{message}</p>}
    </section>
  );
}

// The event's info on a card, folded to ~3 lines with "Zobrazit více / méně" (slice 4 #4).
function EventInfo({ text, t }: { text: string; t: T }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 3;
  return (
    <div className="flex flex-col items-start gap-0.5">
      {/* Folded by height: line-clamp doesn't work across markdown's block elements. */}
      <MarkdownText text={text} className={"text-[14px] text-ink [&_p]:my-1 [&>:first-child]:mt-0 " + (long && !open ? "max-h-[4.6em] overflow-hidden" : "")} />
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[13px] text-ember hover:underline">
          {t(open ? "portal.showLess" : "portal.showMore")}
        </button>
      )}
    </div>
  );
}
