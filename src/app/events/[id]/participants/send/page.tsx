"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { composeHref } from "@/lib/compose-handoff";
import { portalComposeHref } from "@/components/children/portal-link";
import { EMAIL_KINDS, kindAllowed, templateEditHref, type EmailKind } from "@/lib/email-kinds";
import { REGISTRATION_STATES, type RegistrationState } from "@/lib/registration-status";

// Účastníci -> Poslat e-mail: every e-mail in one submenu. The ones sent from here (blank,
// own templates, portal invitation / link) go to the participants picked below; the ones
// that answer something specific (acceptance, document status, reply, health summary)
// explain why and link to where they are launched. Each links to where its template is edited.
type Participant = { id: string; name: string; registrationStatus: "pending" | "accepted"; state: RegistrationState; groupName: string | null; childId: string | null; active: boolean; computed: { contact_email: string | null } };
type Custom = { purposeKey: string; name: string; eventOnly: boolean };
type Item = (EmailKind & { name?: undefined }) | { purposeKey: string; id: "custom"; name: string; launch: "compose"; module: "roster" };

const chip = (on: boolean) => "rounded-full px-2.5 py-0.5 text-[12.5px] " + (on ? "bg-ember text-white" : "bg-paper-2 text-ink-secondary hover:text-ink");
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function SendEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, role } = useTranslations();
  const router = useRouter();
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [selectedKey, setSelectedKey] = useState(EMAIL_KINDS[0].purposeKey);
  const [state, setState] = useState<RegistrationState | "all" | "accepted" | "pending">("all");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch(`/api/events/${id}/modules/mine`).then((r) => (r.ok ? r.json() : {})).then(setAccess).catch(() => {});
    fetch(`/api/events/${id}/email-templates`).then((r) => (r.ok ? r.json() : [])).then(setCustoms).catch(() => {});
    fetch(`/api/events/${id}/participants`).then((r) => (r.ok ? r.json() : [])).then((rows: Participant[]) => setParticipants(rows.filter((p) => p.active))).catch(() => setParticipants([]));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Portal e-mails go through the people list (Lidé), which only admins open.
  const items: Item[] = [
    ...EMAIL_KINDS.filter((k) => kindAllowed(k, access) && (k.launch !== "portal" || role === "admin")),
    ...customs.map((c) => ({ purposeKey: c.purposeKey, id: "custom" as const, name: c.name, launch: "compose" as const, module: "roster" as const })),
  ];
  const fromHere = items.filter((i) => i.launch !== "elsewhere");
  const elsewhere = items.filter((i) => i.launch === "elsewhere");
  const item = items.find((i) => i.purposeKey === selectedKey) ?? items[0];
  const nameOf = (i: Item) => (i.id === "custom" ? i.name : t(`emailKinds.${i.id}.name`));

  const groups = useMemo(() => [...new Set((participants ?? []).map((p) => p.groupName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, "cs")), [participants]);
  const portal = item?.launch === "portal";
  const visible = (participants ?? []).filter(
    (p) =>
      (state === "all" || (state === "accepted" || state === "pending" ? p.registrationStatus === state : p.state === state)) &&
      (!group || p.groupName === group) &&
      (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())) &&
      (!portal || !!p.childId)
  );
  const pickedVisible = visible.filter((p) => picked.has(p.id));
  const toggle = (pid: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(pid)) n.delete(pid); else n.add(pid); return n; });
  const setAll = (on: boolean) => setPicked((prev) => { const n = new Set(prev); for (const p of visible) if (on) n.add(p.id); else n.delete(p.id); return n; });

  function proceed() {
    if (!item || pickedVisible.length === 0) return;
    if (item.launch === "portal") {
      const childIds = [...new Set(pickedVisible.map((p) => p.childId!))];
      router.push(portalComposeHref(childIds, item.id === "portalInvitation" ? "invitation" : undefined));
      return;
    }
    const href = composeHref(id, { mode: "freeform", participantIds: pickedVisible.map((p) => p.id) });
    router.push(item.id === "custom" ? `${href}&template=${encodeURIComponent(item.purposeKey)}` : href);
  }

  const navBtn = (i: Item) => (
    <button key={i.purposeKey} type="button" onClick={() => setSelectedKey(i.purposeKey)} className={"rounded-lg px-3 py-2 text-left text-[13px] font-medium " + (item?.purposeKey === i.purposeKey ? "bg-ember/15 text-ink" : "text-ink-secondary hover:bg-paper-2 hover:text-ink")}>
      {nameOf(i)}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("sendEmail.title")}</h1>
      <p className="mb-5 text-[14px] text-ink-secondary">{t("sendEmail.intro")}</p>
      <div className="flex flex-col gap-6 md:flex-row">
        <select value={item?.purposeKey ?? ""} onChange={(e) => setSelectedKey(e.target.value)} className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink md:hidden">
          {items.map((i) => (
            <option key={i.purposeKey} value={i.purposeKey}>{nameOf(i)}</option>
          ))}
        </select>
        <nav className="hidden w-56 shrink-0 flex-col gap-0.5 self-start md:sticky md:top-4 md:flex">
          <p className="px-3 pb-1 text-[11px] uppercase tracking-wide text-ink-secondary">{t("sendEmail.fromHere")}</p>
          {fromHere.map(navBtn)}
          <a href={`/events/${id}?tab=posta#vlastni-emaily`} className="px-3 py-1.5 text-[12.5px] text-ember hover:underline">+ {t("sendEmail.newOwn")}</a>
          {elsewhere.length > 0 && <p className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-ink-secondary">{t("sendEmail.elsewhere")}</p>}
          {elsewhere.map(navBtn)}
        </nav>

        {item && (
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink">{nameOf(item)}</h2>
            <p className="mt-1 text-[13.5px] text-ink-secondary">{item.id === "custom" ? t("sendEmail.customWhat") : t(`emailKinds.${item.id}.what`)}</p>
            {!("noTemplate" in item && item.noTemplate) && (
              <a href={item.id === "custom" ? `/events/${id}?tab=posta#vlastni-emaily` : templateEditHref(id, item)} className="mt-1 inline-block text-[13px] text-ember hover:underline">
                {t("sendEmail.editTemplate")}
              </a>
            )}

            {item.launch === "elsewhere" ? (
              <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-mist bg-paper p-4">
                <p className="text-[13.5px] text-ink">{t(`emailKinds.${item.id}.where`)}</p>
                <a href={item.launchHref!(id)} className={btnPrimary}>{t(`emailKinds.${item.id}.open`)}</a>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-[13px] font-medium text-ink">{t("sendEmail.recipients")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "accepted", "pending", ...REGISTRATION_STATES] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setState(s)} className={chip(state === s)}>
                      {s === "all" ? t("portal.state.all") : s === "accepted" || s === "pending" ? t(`sendEmail.status.${s}`) : t(`portal.state.${s}`)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("sendEmail.search")} className="w-56 rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink" />
                  {groups.length > 0 && (
                    <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink">
                      <option value="">{t("sendEmail.allGroups")}</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  )}
                  <button type="button" onClick={() => setAll(true)} className="text-[13px] text-ember hover:underline">{t("sendEmail.pickAll")}</button>
                  <button type="button" onClick={() => setAll(false)} className="text-[13px] text-ink-secondary hover:underline">{t("sendEmail.pickNone")}</button>
                </div>
                {portal && <p className="text-[12.5px] text-ink-secondary">{t("sendEmail.portalOnlyLinked")}</p>}
                {!participants ? (
                  <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
                ) : visible.length === 0 ? (
                  <p className="text-[13px] text-ink-secondary">{t("sendEmail.nobody")}</p>
                ) : (
                  <ul className="scrollbar-app max-h-[50vh] overflow-y-auto rounded-lg border border-mist">
                    {visible.map((p) => (
                      <li key={p.id} className="border-b border-mist/60 last:border-0">
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-paper-2">
                          <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-ember" />
                          <span className="flex-1">{p.name}</span>
                          <span className="text-[12px] text-ink-secondary">{p.computed.contact_email || t("sendEmail.noEmail")}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-end">
                  <button type="button" onClick={proceed} disabled={pickedVisible.length === 0} className={btnPrimary}>
                    {t("sendEmail.continue", { count: String(pickedVisible.length) })}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
