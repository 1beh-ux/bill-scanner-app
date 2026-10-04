"use client";

import { useCallback, useEffect, useState } from "react";
import { toBoolean } from "@/lib/participant-fields";
import { previewPrices, type PriceRules } from "@/lib/price-rules";
import PersonPrice, { type CategoryOption, type OddilField } from "@/components/registration/PersonPrice";

// The parent portal UI, mobile-first. Data from /api/portal/<token>
// (src/lib/portal-server.ts); every request carries the birth-date cookie.
type Access = "edit" | "approval" | "read" | "hidden";
type Field = { key: string; label: string; access: Access; fieldType: string; options: unknown; value: string; pending: string | null };
type Guardian = { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean };
type EventRef = { name: string; startDate: string; endDate: string; kind: "event" | "membership"; membershipYear: number | null };
// One person of the link (a child link has one, a family link every member).
type Member = {
  id: string;
  name: string;
  isAdult: boolean;
  profile: { fields: Field[]; guardians: Guardian[]; guardiansPending: Guardian[] | null };
  registrations: {
    participantId: string;
    event: EventRef;
    status: "pending" | "accepted";
    note: string | null;
    payment: { priceCzk: number | null; account: string | null; variableSymbol: string; qrDataUrl: string | null } | null;
    documents: { id: string; name: string; sentToParent: boolean; date: string }[];
  }[];
  history: (EventRef & { id: string; status: "pending" | "accepted" })[];
};
type Data = {
  kind: "child" | "family";
  name: string;
  members: Member[];
  contacts: { name: string | null; email: string; phone: string | null; member: string | null }[];
  available: (EventRef & { id: string; registrationDeadline: string | null; memberIds: string[]; pricing: Pricing })[];
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
type Tab = "profile" | "events" | "registrations" | "history";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist px-3 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const card = "rounded-lg border border-mist bg-paper p-4";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
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
  const [tab, setTab] = useState<Tab>("profile");
  const [memberId, setMemberId] = useState<string | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-16">
      <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("portal.title")}</p>
      {phase === "loading" && <p className="mt-6 text-[14px] text-ink-secondary">{t("portal.loading")}</p>}
      {phase === "unavailable" && <p className="mt-6 text-[15px] text-ink">{t("portal.unavailable")}</p>}
      {phase === "gate" && <Gate api={api} t={t} onPassed={load} />}
      {phase === "ready" && data && (() => {
        const member = data.members.find((m) => m.id === memberId) ?? data.members[0];
        return (
        <>
          <h1 className="mb-4 mt-1 text-[24px] font-semibold text-ink">{data.name}</h1>
          {data.members.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {data.members.map((m) => (
                <button key={m.id} onClick={() => setMemberId(m.id)} className={"rounded-full border px-3 py-1 text-[14px] " + (m.id === member.id ? "border-ember bg-ember/15 text-ink" : "border-mist text-ink-secondary")}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <nav className="scrollbar-app -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-mist px-4">
            {(["profile", "events", "registrations", "history"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={"whitespace-nowrap border-b-2 px-3 py-2 text-[14px] font-medium " + (tab === k ? "border-ember text-ink" : "border-transparent text-ink-secondary")}
              >
                {t(`portal.tab.${k}`)}
                {k === "events" && data.available.length > 0 && <span className="ml-1 rounded-full bg-ember px-1.5 text-[11px] text-white">{data.available.length}</span>}
              </button>
            ))}
          </nav>
          {tab === "profile" && <Profile key={member.id} api={api} member={member} t={t} onSaved={load} />}
          {tab === "events" && <Available api={api} data={data} t={t} evName={evName} onRegistered={() => load().then(() => setTab("registrations"))} />}
          {tab === "registrations" && <Registrations api={api} member={member} t={t} evName={evName} />}
          {tab === "history" && (
            <ul className="flex flex-col gap-2">
              {member.history.length === 0 && <p className="text-[14px] text-ink-secondary">{t("portal.historyEmpty")}</p>}
              {member.history.map((h) => (
                <li key={h.id} className={card + " flex flex-wrap items-center justify-between gap-2 text-[14px]"}>
                  <span className="text-ink">{evName(h)}</span>
                  <span className="text-ink-secondary">{range(h)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
        );
      })()}
    </div>
  );
}

type T = (key: string, vars?: Record<string, string>) => string;

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
    <form onSubmit={submit} className={card + " mt-6 flex flex-col gap-3"}>
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
  const data = member;
  const fields = data.profile.fields;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.pending ?? f.value])));
  const [guardians, setGuardians] = useState<Guardian[]>(data.profile.guardiansPending ?? data.profile.guardians);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    <div className="flex flex-col gap-6">
      <section className={card + " flex flex-col gap-3"}>
        <p className="text-[13px] text-ink-secondary">{t("portal.profileHint")}</p>
        {fields.map((f) => {
          const editable = f.access === "edit" || f.access === "approval";
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-secondary">
                {f.label}
                {f.access === "approval" && <span className="ml-1.5 text-[11.5px]">({t("portal.needsApproval")})</span>}
              </span>
              {editable ? (
                <FieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} t={t} />
              ) : (
                <span className="text-[15px] text-ink">{show(f, f.value)}</span>
              )}
              {f.pending !== null && (
                <span className="text-[12.5px] text-amber-700">
                  {t("portal.pendingApproval", { value: show(f, f.pending), old: show(f, f.value) })}
                </span>
              )}
            </div>
          );
        })}
        {message && <p className="text-[14px] text-ink">{message}</p>}
        <button onClick={saveFields} disabled={busy} className={btnPrimary}>
          {t("portal.save")}
        </button>
      </section>

      <section className={card + " flex flex-col gap-3"}>
        <h2 className="text-[16px] font-semibold text-ink">{t("portal.guardians")}</h2>
        <p className="text-[13px] text-ink-secondary">
          {data.profile.guardiansPending ? t("portal.guardiansPending", { current: data.profile.guardians.map((g) => g.email).join(", ") || "—" }) : t("portal.guardiansApprovalHint")}
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

function FieldInput({ field, value, onChange, t }: { field: Field; value: string; onChange: (v: string) => void; t: T }) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[15px] text-ink">
        <input type="checkbox" checked={toBoolean(value, field.options) === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {t("portal.yes")}
      </label>
    );
  }
  if (field.fieldType === "select") {
    const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string") : [];
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">—</option>
        {[...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

function Available({ api, data, t, evName, onRegistered }: { api: string; data: Data; t: T; evName: (e: EventRef) => string; onRegistered: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Per picked member: price category + Oddíl (price rules, slice 3 C).
  const [choice, setChoice] = useState<Record<string, { category?: string; oddil?: string }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberOf = (id: string) => data.members.find((m) => m.id === id)!;
  const value = (m: Member, key: string) => m.profile.fields.find((f) => f.key === key)?.value || "";

  async function register(eventId: string) {
    setBusy(true);
    setError(null);
    const picks = picked.map((memberId) => ({ memberId, priceCategory: choice[memberId]?.category, oddil: choice[memberId]?.oddil }));
    const res = await fetch(`${api}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, picks, note }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t("portal.registerFailed"));
    setOpenId(null);
    setNote("");
    onRegistered();
  }

  if (data.available.length === 0) return <p className="text-[14px] text-ink-secondary">{t("portal.noEvents")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {data.available.map((e) => (
        <li key={e.id} className={card + " flex flex-col gap-3"}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[16px] font-semibold text-ink">{evName(e)}</span>
            <span className="text-[13px] text-ink-secondary">{range(e)}</span>
          </div>
          {e.registrationDeadline && <span className="text-[13px] text-ink-secondary">{t("portal.deadline", { date: date(e.registrationDeadline) })}</span>}
          {openId !== e.id ? (
            <button onClick={() => { setOpenId(e.id); setPicked(e.memberIds); setChoice({}); setError(null); }} className={btnPrimary}>
              {t("portal.register")}
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg bg-paper-2 p-3">
              <p className="text-[13px] text-ink-secondary">{t("portal.reviewHint")}</p>
              {(() => {
                // Live prices of the picked members together (the household counts them all).
                const pm = (id: string) => e.pricing.members.find((x) => x.id === id)!;
                const prices = previewPrices(
                  { ...e.pricing, eventStart: new Date(e.pricing.eventStart) },
                  picked.map((id) => ({ category: choice[id]?.category ?? pm(id).categories[0]?.key, isAdult: pm(id).isAdult, isMember: pm(id).isMember }))
                );
                const priceOf = (id: string) => (picked.includes(id) ? prices[picked.indexOf(id)] : null);
                const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);
                return (
                  <>
              {e.memberIds.map((id) => {
                const m = memberOf(id);
                return (
                  <div key={id} className="flex flex-col gap-2 rounded-lg border border-mist bg-paper p-2 text-[14px]">
                  <label className="flex items-start gap-2">
                    {e.memberIds.length > 1 && (
                      <input type="checkbox" className="mt-1" checked={picked.includes(id)} onChange={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
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
                  {picked.includes(id) && (
                    <PersonPrice
                      categories={pm(id).categories}
                      category={choice[id]?.category}
                      onCategory={(category) => setChoice((c) => ({ ...c, [id]: { ...c[id], category } }))}
                      oddil={e.pricing.oddil}
                      oddilValue={choice[id]?.oddil}
                      onOddil={(oddil) => setChoice((c) => ({ ...c, [id]: { ...c[id], oddil } }))}
                      price={priceOf(id)}
                      t={t}
                    />
                  )}
                  </div>
                );
              })}
              {picked.length > 1 && <p className="text-[14px] font-medium text-ink">{t("portal.total", { price: String(total) })}</p>}
                  </>
                );
              })()}
              <label className="text-[13px] text-ink-secondary">
                {t("portal.note")}
                <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} maxLength={2000} className={inputClass + " mt-1"} />
              </label>
              {error && <p className="text-[14px] text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => register(e.id)} disabled={busy || picked.length === 0} className={btnPrimary}>
                  {t("portal.registerConfirm")}
                </button>
                <button onClick={() => setOpenId(null)} disabled={busy} className={btn}>
                  {t("portal.cancel")}
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Registrations({ api, member: data, t, evName }: { api: string; member: Member; t: T; evName: (e: EventRef) => string }) {
  if (data.registrations.length === 0) return <p className="text-[14px] text-ink-secondary">{t("portal.noRegistrations")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {data.registrations.map((r) => (
        <li key={r.participantId} className={card + " flex flex-col gap-3"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[16px] font-semibold text-ink">{evName(r.event)}</span>
            <span className={"rounded-full px-2.5 py-0.5 text-[13px] " + (r.status === "accepted" ? "bg-pine/15 text-pine" : "bg-ember/15 text-ember")}>
              {t(r.status === "accepted" ? "portal.statusAccepted" : "portal.statusPending")}
            </span>
          </div>
          <span className="text-[13px] text-ink-secondary">{range(r.event)}</span>
          {r.payment && (
            <div className="flex flex-col gap-1 rounded-lg bg-paper-2 p-3 text-[14px]">
              <p className="font-medium text-ink">{t("portal.payment")}</p>
              {r.payment.priceCzk != null && <p>{t("portal.price", { price: String(r.payment.priceCzk) })}</p>}
              {r.payment.account && <p>{t("portal.account", { account: r.payment.account })}</p>}
              {r.payment.variableSymbol && <p>{t("portal.vs", { vs: r.payment.variableSymbol })}</p>}
              {r.payment.qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing to optimise
                <img src={r.payment.qrDataUrl} alt={t("portal.qrAlt")} className="mt-2 h-44 w-44 self-start rounded bg-white p-1" />
              )}
            </div>
          )}
          {r.documents.length > 0 && (
            <div className="flex flex-col gap-1 text-[14px]">
              <p className="font-medium text-ink">{t("portal.documents")}</p>
              {r.documents.map((d) => (
                <a key={d.id} href={`${api}/documents/${d.id}`} className="text-ember underline">
                  {d.name} · {t(d.sentToParent ? "portal.docSent" : "portal.docReceived")} {date(d.date)}
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
