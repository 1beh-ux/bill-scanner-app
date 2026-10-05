"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { toBoolean } from "@/lib/participant-fields";
import PendingChanges, { type PendingChange } from "@/components/children/PendingChanges";
import { copyPortalLink, portalComposeHref } from "@/components/children/portal-link";
import { appliesTo, type FieldAudience, type FieldLevel } from "@/lib/registration-fields";

// Admin child detail (docs/registration-portal-spec.md B): the whole profile --
// every org-wide field whatever its portal access -- guardians, linked events,
// pending parent changes and the portal link tools. Saving pushes the changed
// values into the child's upcoming registration-connected events.
type Field = { key: string; label: string; fieldType: string; options: unknown; active: boolean; portalAccess: "edit" | "approval" | "read" | "hidden"; audience: FieldAudience; level: FieldLevel };
type Guardian = { name: string; email: string; relationship: string; phone: string; receivesCommunications: boolean };
type Detail = {
  id: string;
  name: string;
  dateOfBirth: string | null;
  isAdult: boolean;
  family: { id: string; name: string } | null;
  values: Record<string, string>;
  fields: Field[];
  guardians: { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean }[];
  participants: {
    id: string;
    registrationStatus: "pending" | "accepted";
    active: boolean;
    portalNote: string | null;
    event: { id: string; name: string; startDate: string; status: "active" | "closed"; kind: "event" | "membership"; membershipYear: number | null; registrationConnected: boolean };
  }[];
  pendingChanges: PendingChange[];
  emailLogs: { id: string; email: string; status: "sent" | "failed"; errorMessage: string | null; sentAt: string; subject: string | null }[];
  portalUrl: string | null;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const sectionTitle = "mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-secondary";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const BUILTINS = ["participant_first_name", "participant_last_name", "datum_narozeni"] as const;

export default function ChildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, role, roleLoaded } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoaded && role !== "admin") router.replace("/events");
  }, [roleLoaded, role, router]);

  async function load() {
    const res = await fetch(`/api/children/${id}`);
    if (!res.ok) return setNotFound(true);
    const d: Detail = await res.json();
    setData(d);
    setValues(d.values);
    setGuardians(
      d.guardians.map((g) => ({ name: g.name ?? "", email: g.email, relationship: g.relationship ?? "", phone: g.phone ?? "", receivesCommunications: g.receivesCommunications }))
    );
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/children/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    setSaving(false);
    setMessage(res.ok ? t("childProfile.saved") : t("children.errorFailed"));
    if (res.ok) load();
  }

  // Adult member (slice 3 A): leaders/supporters are people in the register too.
  async function setAdult(isAdult: boolean) {
    const res = await fetch(`/api/children/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isAdult }) });
    setMessage(res.ok ? t("childProfile.saved") : t("children.errorFailed"));
    if (res.ok) load();
  }

  async function action(body: object): Promise<Response> {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/children/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    return res;
  }

  async function saveGuardians() {
    const res = await action({ action: "guardians", guardians: guardians.filter((g) => g.email.trim()) });
    setMessage(res.ok ? t("childProfile.saved") : t("childProfile.guardiansInvalid"));
    if (res.ok) load();
  }

  async function copyLink() {
    const ok = await copyPortalLink(id);
    setMessage(ok ? t("childProfile.linkCopied", { name: data?.name ?? "" }) : t("children.errorFailed"));
    if (ok && !data?.portalUrl) load();
  }

  async function regenerate() {
    if (!(await confirm({ message: t("childProfile.newLinkConfirm"), danger: true }))) return;
    const res = await action({ action: "token", regenerate: true });
    setMessage(res.ok ? t("childProfile.newLinkDone") : t("children.errorFailed"));
    load();
  }

  if (!roleLoaded || role !== "admin") return null;
  const back = (
    <Link href="/children" className="text-[13px] text-ink-secondary hover:text-ink">
      ← {t("children.title")}
    </Link>
  );
  if (notFound) return <div className="mx-auto max-w-5xl p-4 md:p-8">{back}<p className="mt-4 text-[14px] text-ink-secondary">{t("childProfile.notFound")}</p></div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const labelOf = (key: string) =>
    key === "participant_first_name"
      ? t("participantsPage.firstNameLabel")
      : key === "participant_last_name"
        ? t("participantsPage.lastNameLabel")
        : key === "datum_narozeni"
          ? t("participantsPage.dobLabel")
          : (data.fields.find((f) => f.key === key)?.label ?? key);
  const accessBadge = (access: Field["portalAccess"]) =>
    access !== "hidden" && (
      <span className="ml-1.5 rounded bg-paper-2 px-1.5 py-0.5 text-[11px] text-ink-secondary">{t(`portalAccess.${access}`)}</span>
    );
  const setValue = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));
  // Slice 5: only the person's audience, but a stored value is never hidden.
  const shownField = (f: Field) => (f.active && appliesTo(f.audience, data.isAdult)) || !!values[f.key];

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      {back}
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{data.name}</h1>
      <p className="mb-2 text-[13px] text-ink-secondary">
        {t("children.colBirth")}: {date(data.dateOfBirth)}
      </p>
      <label className="mb-5 flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={data.isAdult} disabled={saving} onChange={(e) => setAdult(e.target.checked)} />
        {t("people.isAdult")}
      </label>
      {data.family && <p className="-mt-3 mb-5 text-[13px] text-ink-secondary">{t("families.memberOf", { name: data.family.name })}</p>}
      {message && <p className="mb-4 text-[13px] text-ink">{message}</p>}

      <div className="flex flex-col gap-8">
        <section className="rounded-lg border border-mist bg-paper-2 p-3">
          <h2 className={sectionTitle}>{t("childProfile.portalTitle")}</h2>
          <p className="mb-2 text-[12.5px] text-ink-secondary">{data.portalUrl ? t("childProfile.portalHasLink") : t("childProfile.portalNoLink")}</p>
          {data.family && <p className="mb-2 text-[12.5px] text-ink-secondary">{t("families.childLinkHint", { name: data.family.name })}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={copyLink} disabled={saving} className={btn}>
              {t("childProfile.copyLink")}
            </button>
            {data.portalUrl && (
              <button onClick={regenerate} disabled={saving} className={btn}>
                {t("childProfile.newLink")}
              </button>
            )}
            <button onClick={() => router.push(portalComposeHref([id]))} className={btn}>
              {t("childProfile.sendLink")}
            </button>
          </div>
        </section>

        <PendingChanges changes={data.pendingChanges} onDecided={load} />

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className={sectionTitle}>{t("childProfile.profileTitle")}</h2>
            <p className="-mt-2 text-[12px] text-ink-secondary">{t("childProfile.profileHint")}</p>
            {BUILTINS.map((key) => (
              <label key={key} className="text-[13px] text-ink-secondary">
                {labelOf(key)}
                {accessBadge("approval")}
                <input
                  type={key === "datum_narozeni" ? "date" : "text"}
                  value={values[key] ?? ""}
                  onChange={(e) => setValue(key, e.target.value)}
                  className={inputClass + " mt-1"}
                />
              </label>
            ))}
            {/* Slice 5 #4: basic here, detailed below. */}
            {data.fields
              .filter((f) => f.level !== "detailed" && shownField(f))
              .map((f) => (
                <ProfileInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValue(f.key, v)} badge={accessBadge(f.portalAccess)} />
              ))}
            {data.fields.some((f) => f.level === "detailed" && shownField(f)) && (
              <>
                <h2 className={sectionTitle + " mb-0 mt-3"}>{t("childProfile.detailedTitle")}</h2>
                <p className="-mt-2 text-[12px] text-ink-secondary">{t("childProfile.detailedHint")}</p>
              </>
            )}
            {data.fields
              .filter((f) => f.level === "detailed" && shownField(f))
              .map((f) => (
                <ProfileInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValue(f.key, v)} badge={accessBadge(f.portalAccess)} />
              ))}
            <div>
              <button onClick={saveProfile} disabled={saving} className={btnPrimary}>
                {saving ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </section>

          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-2">
              <h2 className={sectionTitle}>
                {t("participantDetail.guardiansTitle")}
                {accessBadge("edit")}
              </h2>
              {guardians.map((g, i) => {
                const patch = (p: Partial<Guardian>) => setGuardians((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-mist p-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input placeholder={t("common.name")} value={g.name} onChange={(e) => patch({ name: e.target.value })} className={inputClass} />
                      <input type="email" placeholder={t("participantDetail.guardianEmailLabel")} value={g.email} onChange={(e) => patch({ email: e.target.value })} className={inputClass} />
                      <input placeholder={t("participantDetail.guardianRelationshipLabel")} value={g.relationship} onChange={(e) => patch({ relationship: e.target.value })} className={inputClass} />
                      <input type="tel" placeholder={t("participantDetail.guardianPhoneLabel")} value={g.phone} onChange={(e) => patch({ phone: e.target.value })} className={inputClass} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-[13px] text-ink">
                        <input type="checkbox" checked={g.receivesCommunications} onChange={(e) => patch({ receivesCommunications: e.target.checked })} />
                        {t("participantDetail.guardianReceivesLabel")}
                      </label>
                      <button type="button" onClick={() => setGuardians((prev) => prev.filter((_, j) => j !== i))} className="text-[13px] text-red-600 hover:underline">
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGuardians((prev) => [...prev, { name: "", email: "", relationship: "", phone: "", receivesCommunications: true }])}
                  className={btn}
                >
                  {t("participantDetail.addGuardianButton")}
                </button>
                <button type="button" onClick={saveGuardians} disabled={saving} className={btn}>
                  {t("childProfile.saveGuardians")}
                </button>
              </div>
              <p className="text-[11.5px] text-ink-secondary">{t("childProfile.guardiansHint")}</p>
            </section>

            <section>
              <h2 className={sectionTitle}>{t("children.colEvents")}</h2>
              <ul className="flex flex-col gap-1.5">
                {data.participants.map((p) => (
                  <li key={p.id} className="rounded-lg border border-mist px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/events/${p.event.id}/participants/${p.id}`} className="text-ink underline hover:text-ember">
                        {p.event.kind === "membership" ? t("children.membershipChip", { year: String(p.event.membershipYear ?? "?") }) : p.event.name}
                      </Link>
                      <span className="flex flex-wrap gap-1.5 text-[12px] text-ink-secondary">
                        <span>{date(p.event.startDate)}</span>
                        <span className={"rounded px-1.5 " + (p.registrationStatus === "accepted" ? "bg-pine-bg text-pine" : "bg-ember/15 text-ink")}>
                          {p.registrationStatus === "accepted" ? t("participantsPage.statusAccepted") : t("children.pending")}
                        </span>
                        {p.event.registrationConnected && p.event.status === "active" && <span className="rounded bg-paper-2 px-1.5">{t("childProfile.syncedEvent")}</span>}
                      </span>
                    </div>
                    {p.portalNote && <p className="mt-1 text-[12.5px] text-ink-secondary">{t("childProfile.portalNote")}: {p.portalNote}</p>}
                  </li>
                ))}
              </ul>
            </section>

            {data.emailLogs.length > 0 && (
              <section>
                <h2 className={sectionTitle}>{t("childProfile.sentLinksTitle")}</h2>
                <ul className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
                  {data.emailLogs.map((l) => (
                    <li key={l.id}>
                      {new Date(l.sentAt).toLocaleString("cs-CZ")} · {l.email} ·{" "}
                      <span className={l.status === "sent" ? "text-pine" : "text-red-600"}>{l.status === "sent" ? t("childProfile.sent") : `${t("childProfile.failed")} (${l.errorMessage ?? ""})`}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// One org-wide field by its type; values are plain strings ("true"/"false" for booleans), as on participants.
function ProfileInput({ field, value, onChange, badge }: { field: Field; value: string; onChange: (v: string) => void; badge: React.ReactNode }) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={toBoolean(value, field.options) === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
        {badge}
      </label>
    );
  }
  const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string") : [];
  return (
    <label className="text-[13px] text-ink-secondary">
      {field.label}
      {badge}
      {field.fieldType === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass + " mt-1"}>
          <option value="">—</option>
          {[...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass + " mt-1"}
        />
      )}
    </label>
  );
}
