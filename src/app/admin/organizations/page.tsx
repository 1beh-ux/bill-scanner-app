"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { useSwitchOrg } from "@/components/ActingOrg";

// Aplikace -> Organizace (super-admin, organizations step 3): every organization,
// a new one with its first admin, edit, switch into it, (de)activate.
type Org = { id: string; name: string; shortName: string; contactEmail: string | null; active: boolean; admins: string[]; users: number; events: number; publicHosts: number };
type NewForm = { name: string; shortName: string; contactEmail: string; adminEmail: string; adminName: string };
type EditForm = { id: string; name: string; shortName: string; contactEmail: string };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const inputSm = "w-full rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const linkBtn = "text-[13px] text-ember hover:underline disabled:opacity-50";
const EMPTY: NewForm = { name: "", shortName: "", contactEmail: "", adminEmail: "", adminName: "" };

export default function OrganizationsPage() {
  const { t, isSuperAdmin, roleLoaded, organization } = useTranslations();
  const confirm = useConfirm();
  const switchOrg = useSwitchOrg();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [form, setForm] = useState<NewForm | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { organizations: Org[]; homeOrganizationId: string } | null) => {
        if (!data) return;
        setOrgs(data.organizations);
        setHomeId(data.homeOrganizationId);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const errorText = (body: { error?: string; organization?: string }) =>
    body.error === "email_taken" ? t("orgs.errorEmailTaken", { org: body.organization ?? "" }) : t(`orgs.error_${body.error ?? "failed"}`);

  async function create(f: NewForm) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!res.ok) return setError(errorText(await res.json().catch(() => ({}))));
    setForm(null);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/organizations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(errorText(await res.json().catch(() => ({}))));
      return false;
    }
    await load();
    return true;
  }

  async function toggleActive(o: Org) {
    const message = o.active ? t("orgs.deactivateConfirm", { name: o.name }) : t("orgs.activateConfirm", { name: o.name });
    if (!(await confirm({ message, danger: o.active, confirmLabel: o.active ? t("orgs.deactivate") : t("orgs.activate") }))) return;
    await patch(o.id, { active: !o.active });
  }

  if (roleLoaded && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("orgs.superAdminOnly")}</div>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">{t("orgs.title")}</h1>
        {!form && (
          <button type="button" className={linkBtn} onClick={() => { setError(null); setForm(EMPTY); }}>
            + {t("orgs.new")}
          </button>
        )}
      </div>
      <p className="mb-5 text-[14px] text-ink-secondary">{t("orgs.subtitle")}</p>

      {form && (
        <div className="mb-5 flex max-w-xl flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
          <h2 className="text-[15px] font-semibold text-ink">{t("orgs.new")}</h2>
          {(["name", "shortName", "contactEmail"] as const).map((k) => (
            <label key={k} className="text-[13px] text-ink-secondary">
              {t(`orgs.field_${k}`)}
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass + " mt-1"} type={k === "contactEmail" ? "email" : "text"} />
            </label>
          ))}
          <p className="mt-1 text-[13px] font-medium text-ink">{t("orgs.firstAdmin")}</p>
          {(["adminEmail", "adminName"] as const).map((k) => (
            <label key={k} className="text-[13px] text-ink-secondary">
              {t(`orgs.field_${k}`)}
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass + " mt-1"} type={k === "adminEmail" ? "email" : "text"} />
            </label>
          ))}
          <p className="text-[12px] text-ink-secondary">{t("orgs.templatesCopiedHint")}</p>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setForm(null)} className="text-[14px] text-ink-secondary hover:underline">{t("common.cancel")}</button>
            <button type="button" disabled={busy} onClick={() => create(form)} className={btnPrimary}>{t("orgs.create")}</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-mist">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-paper-2 text-ink-secondary">
            <tr>
              {["colName", "colShort", "colContact", "colAdmins", "colUsers", "colEvents", "colHosts", "colActive"].map((k) => (
                <th key={k} className="px-3 py-2 font-medium">{t(`orgs.${k}`)}</th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) =>
              edit?.id === o.id ? (
                <tr key={o.id} className="border-t border-mist align-top">
                  <td className="px-3 py-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputSm} /></td>
                  <td className="px-3 py-2"><input value={edit.shortName} onChange={(e) => setEdit({ ...edit, shortName: e.target.value })} className={inputSm} /></td>
                  <td className="px-3 py-2"><input value={edit.contactEmail} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} className={inputSm} type="email" /></td>
                  <td colSpan={5} />
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" className="mr-3 text-[13px] text-pine hover:underline" onClick={async () => { if (await patch(o.id, { name: edit.name, shortName: edit.shortName, contactEmail: edit.contactEmail })) setEdit(null); }}>{t("common.save")}</button>
                    <button type="button" className="text-[13px] text-ink-secondary hover:underline" onClick={() => setEdit(null)}>{t("common.cancel")}</button>
                  </td>
                </tr>
              ) : (
                <tr key={o.id} className={"border-t border-mist align-top" + (o.active ? "" : " opacity-60")}>
                  <td className="px-3 py-2 text-ink">
                    {o.name}
                    {o.id === homeId && <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] text-ink-secondary">{t("orgs.home")}</span>}
                    {o.id === organization?.id && o.id !== homeId && <span className="ml-2 rounded-full bg-ember px-2 py-0.5 text-[11px] text-white">{t("orgs.acting")}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink">{o.shortName}</td>
                  <td className="px-3 py-2 text-ink-secondary [overflow-wrap:anywhere]">{o.contactEmail ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-secondary [overflow-wrap:anywhere]">{o.admins.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-ink">{o.users}</td>
                  <td className="px-3 py-2 text-ink">{o.events}</td>
                  <td className="px-3 py-2 text-ink">{o.publicHosts}</td>
                  <td className="px-3 py-2 text-ink">{o.active ? t("connections.yes") : t("connections.no")}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                      {o.active && o.id !== organization?.id && (
                        <button type="button" className={linkBtn} onClick={() => switchOrg(o.id)}>{t("orgs.switch")}</button>
                      )}
                      <button type="button" className={linkBtn} onClick={() => { setError(null); setEdit({ id: o.id, name: o.name, shortName: o.shortName, contactEmail: o.contactEmail ?? "" }); }}>{t("common.edit")}</button>
                      {o.id !== homeId && (
                        <button type="button" className={linkBtn} onClick={() => toggleActive(o)}>{o.active ? t("orgs.deactivate") : t("orgs.activate")}</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {!form && error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}
