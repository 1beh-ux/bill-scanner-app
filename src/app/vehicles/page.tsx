"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import HelpLink from "@/components/HelpLink";
import VehicleForm, { usesTp, vehicleOwnerName, type Owner, type VehicleRow } from "@/components/travel/VehicleForm";

// Organizace -> Vozidla (organization admins): every car used on travel orders; add / edit / archive, search.
export default function VehiclesPage() {
  const { t, role, roleLoaded } = useTranslations();
  const confirm = useConfirm();
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [editing, setEditing] = useState<VehicleRow | "new" | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/vehicles?archived=1`).catch(() => null);
    setVehicles(res?.ok ? (await res.json()).vehicles : []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
    Promise.all([
      fetch("/api/children?list=1").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/authors").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([kids, authors]: [{ id: string; name: string; isAdult: boolean }[], { id: string; canonicalName: string; mergedIntoAuthorId: string | null }[]]) =>
        setOwners([
          ...kids.filter((k) => k.isAdult).map((k) => ({ kind: "child" as const, id: k.id, name: k.name })),
          ...authors.filter((a) => !a.mergedIntoAuthorId).map((a) => ({ kind: "author" as const, id: a.id, name: a.canonicalName })),
        ]),
      )
      .catch(() => setOwners([]));
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("cs");
    return (vehicles ?? []).filter((v) => (showArchived || !v.archivedAt) && (!needle || [v.label, v.plate, vehicleOwnerName(v)].some((s) => s?.toLocaleLowerCase("cs").includes(needle))));
  }, [vehicles, q, showArchived]);

  if (roleLoaded && role !== "admin") return <div className="p-8 text-[14px] text-ink-secondary">{t("common.adminOnly")}</div>;

  async function archive(v: VehicleRow) {
    if (!v.archivedAt && !(await confirm({ message: t("vehicles.archiveConfirm", { label: v.label }) }))) return;
    await fetch(`/api/vehicles/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !v.archivedAt }) }).catch(() => null);
    load();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="flex items-center gap-2">
        <h1 className="text-[22px] font-semibold text-ink">{t("vehicles.title")}</h1>
        <HelpLink slug="cestovni-prikazy" />
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("vehicles.hint")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover" onClick={() => setEditing("new")}>
          + {t("vehicles.add")}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("vehicles.search")} aria-label={t("vehicles.search")} className="rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink" />
        <label className="flex items-center gap-1 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("vehicles.showArchived")}
        </label>
      </div>
      {editing && (
        <div className="mb-4">
          <VehicleForm
            vehicle={editing === "new" ? null : editing}
            owners={owners}
            allowFreeOwner
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </div>
      )}
      {!vehicles ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("vehicles.none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full text-[13px]">
            <thead className="bg-paper-2 text-left text-ink-secondary">
              <tr>
                <th className="p-2">{t("vehicles.field.owner")}</th>
                <th className="p-2">{t("vehicles.field.label")}</th>
                <th className="p-2">{t("vehicles.field.plate")}</th>
                <th className="p-2">{t("vehicles.field.fuel")}</th>
                <th className="p-2">{t("vehicles.field.gearbox")}</th>
                <th className="p-2">{t("vehicles.field.consumption")}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} className={"border-t border-mist " + (v.archivedAt ? "text-ink-secondary" : "text-ink")}>
                  <td className="p-2">{vehicleOwnerName(v)}</td>
                  <td className="p-2">
                    {v.label}
                    {v.archivedAt && <span className="ml-2 rounded bg-paper-2 px-1 text-[11px]">{t("vehicles.archived")}</span>}
                  </td>
                  <td className="whitespace-nowrap p-2">{v.plate ?? "—"}</td>
                  <td className="p-2">{t(`vehicles.fuel.${v.fuel}`)}</td>
                  <td className="p-2">{t(`vehicles.gearbox.${v.gearbox}`)}</td>
                  <td className="p-2">{usesTp(v) ? t("vehicles.fromTp") : t("vehicles.fromTable")}</td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <button type="button" className="mr-3 text-ember hover:underline" onClick={() => setEditing(v)}>
                      {t("common.edit")}
                    </button>
                    <button type="button" className="text-ink-secondary hover:underline" onClick={() => archive(v)}>
                      {v.archivedAt ? t("vehicles.restore") : t("vehicles.archive")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
