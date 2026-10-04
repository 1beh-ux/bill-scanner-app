"use client";

import { useCallback, useEffect, useState } from "react";
import { toBoolean } from "@/lib/participant-fields";

// The parent portal UI, mobile-first. Data from /api/portal/<token>
// (src/lib/portal-server.ts); every request carries the birth-date cookie.
type Access = "edit" | "approval" | "read" | "hidden";
type Field = { key: string; label: string; access: Access; fieldType: string; options: unknown; value: string; pending: string | null };
type Guardian = { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean };
type EventRef = { name: string; startDate: string; endDate: string; kind: "event" | "membership"; membershipYear: number | null };
type Data = {
  child: { name: string };
  profile: { fields: Field[]; guardians: Guardian[]; guardiansPending: Guardian[] | null };
  available: (EventRef & { id: string; registrationDeadline: string | null })[];
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
      {phase === "ready" && data && (
        <>
          <h1 className="mb-4 mt-1 text-[24px] font-semibold text-ink">{data.child.name}</h1>
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
          {tab === "profile" && <Profile api={api} data={data} t={t} onSaved={load} />}
          {tab === "events" && <Available api={api} data={data} t={t} evName={evName} onRegistered={() => load().then(() => setTab("registrations"))} />}
          {tab === "registrations" && <Registrations api={api} data={data} t={t} evName={evName} />}
          {tab === "history" && (
            <ul className="flex flex-col gap-2">
              {data.history.length === 0 && <p className="text-[14px] text-ink-secondary">{t("portal.historyEmpty")}</p>}
              {data.history.map((h) => (
                <li key={h.id} className={card + " flex flex-wrap items-center justify-between gap-2 text-[14px]"}>
                  <span className="text-ink">{evName(h)}</span>
                  <span className="text-ink-secondary">{range(h)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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

function Profile({ api, data, t, onSaved }: { api: string; data: Data; t: T; onSaved: () => void }) {
  const fields = data.profile.fields;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.pending ?? f.value])));
  const [guardians, setGuardians] = useState<Guardian[]>(data.profile.guardiansPending ?? data.profile.guardians);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function patch(body: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${api}/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = (key: string) => data.profile.fields.find((f) => f.key === key)?.value || "—";

  async function register(eventId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${api}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, note }) }).catch(() => null);
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
            <button onClick={() => { setOpenId(e.id); setError(null); }} className={btnPrimary}>
              {t("portal.register")}
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg bg-paper-2 p-3">
              <p className="text-[13px] text-ink-secondary">{t("portal.reviewHint")}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-ink-secondary">{t("portal.reviewName")}</dt>
                <dd className="text-ink">{[value("participant_first_name"), value("participant_last_name")].join(" ")}</dd>
                <dt className="text-ink-secondary">{t("portal.reviewBirth")}</dt>
                <dd className="text-ink">{date(data.profile.fields.find((f) => f.key === "datum_narozeni")?.value || null)}</dd>
                <dt className="text-ink-secondary">{t("portal.guardians")}</dt>
                <dd className="text-ink [overflow-wrap:anywhere]">{data.profile.guardians.map((g) => g.email).join(", ") || "—"}</dd>
              </dl>
              <label className="text-[13px] text-ink-secondary">
                {t("portal.note")}
                <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} maxLength={2000} className={inputClass + " mt-1"} />
              </label>
              {error && <p className="text-[14px] text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => register(e.id)} disabled={busy} className={btnPrimary}>
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

function Registrations({ api, data, t, evName }: { api: string; data: Data; t: T; evName: (e: EventRef) => string }) {
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
