"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import ListTemplateAdmin from "@/components/health/ListTemplateAdmin";

type EventDetail = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "closed";
  closedAt: string | null;
  driveIngestFolderId: string | null;
  driveExportFolderId: string | null;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  budgetAmount: string;
  isFromTemplate: boolean;
};

type ExportSummary = {
  totalApproved: number;
  newlyExported: number;
  alreadyExported: number;
  manifestSpreadsheetId: string;
};

type ModuleKey = "bills" | "health";

type ModuleState = { moduleKey: ModuleKey; enabled: boolean };

type AccessRow = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "accountant" | "user";
  access: Record<ModuleKey, boolean>;
};

const MODULE_KEYS: ModuleKey[] = ["bills", "health"];

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [tab, setTab] = useState<"settings" | "access" | "health">("settings");
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [billCount, setBillCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [driveAccountEmail, setDriveAccountEmail] = useState("");
  const [ingestFolderId, setIngestFolderId] = useState("");
  const [exportFolderId, setExportFolderId] = useState("");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSaving, setDriveSaving] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportSummary | null>(null);

  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [evRes, catRes, billsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/categories`),
      fetch(`/api/events/${id}/bills`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    if (billsRes.ok) setBillCount((await billsRes.json()).length);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch(`/api/events/${id}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => setModuleAccess({}));
  }, [id]);

  useEffect(() => {
    if (tab === "health" && !moduleAccess.health) setTab("settings");
  }, [tab, moduleAccess]);

  useEffect(() => {
    fetch("/api/config/drive-account")
      .then((r) => r.json())
      .then((d) => setDriveAccountEmail(d.email || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (event) {
      setIngestFolderId(event.driveIngestFolderId ?? "");
      setExportFolderId(event.driveExportFolderId ?? "");
    }
  }, [event?.id]);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditValue(cat.budgetAmount);
  }

  async function saveBudget(catId: string) {
    setError(null);
    const res = await fetch(`/api/event-categories/${catId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetAmount: editValue }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("eventDetail.errorSaveBudget"));
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newCategoryName.trim()) return;

    const res = await fetch(`/api/events/${id}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("eventDetail.errorAddCategory"));
      return;
    }

    setNewCategoryName("");
    load();
  }

  async function handleDeleteCategory(catId: string) {
    if (!window.confirm(t("eventDetail.confirmDeleteCategory"))) return;
    await fetch(`/api/event-categories/${catId}`, { method: "DELETE" });
    load();
  }

  async function handleSaveDriveFolders(e: React.FormEvent) {
    e.preventDefault();
    setDriveError(null);
    setDriveSaving(true);
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveIngestFolderId: ingestFolderId.trim() || null,
        driveExportFolderId: exportFolderId.trim() || null,
      }),
    });
    setDriveSaving(false);
    if (!res.ok) {
      setDriveError(t("driveSettings.errorSaveFailed"));
      return;
    }
    load();
  }

  async function handleExportNow() {
    setExportError(null);
    setExportResult(null);
    setExporting(true);
    const res = await fetch(`/api/events/${id}/drive-export`, { method: "POST" });
    setExporting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "exportGeneric" }));
      setExportError(data.error || "exportGeneric");
      return;
    }
    setExportResult(await res.json());
  }

  async function handleClose() {
    if (!window.confirm(t("eventDetail.confirmClose"))) return;
    setLifecycleError(null);
    setLifecycleBusy(true);
    const res = await fetch(`/api/events/${id}/close`, { method: "POST" });
    setLifecycleBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLifecycleError(data.error || "lifecycleGeneric");
      return;
    }
    load();
  }

  async function handleReopen() {
    if (!window.confirm(t("eventDetail.confirmReopen"))) return;
    setLifecycleError(null);
    setLifecycleBusy(true);
    const res = await fetch(`/api/events/${id}/reopen`, { method: "POST" });
    setLifecycleBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLifecycleError(data.error || "lifecycleGeneric");
      return;
    }
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  const totalBudget = categories.reduce((sum, c) => sum + parseFloat(c.budgetAmount || "0"), 0);
  const hasFolderInput = !!(ingestFolderId.trim() || exportFolderId.trim());

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href="/events" className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("eventDetail.back")}
      </a>

      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{event.name}</h1>
      <p className="mb-3 text-[14px] text-ink-secondary">
        {new Date(event.startDate).toLocaleDateString("cs-CZ")} –{" "}
        {new Date(event.endDate).toLocaleDateString("cs-CZ")} ·{" "}
        {event.status === "active" ? t("common.statusActive") : t("common.statusClosed")}
        {event.status === "closed" && event.closedAt && (
          <> · {t("eventDetail.closedAtLabel", { date: new Date(event.closedAt).toLocaleDateString("cs-CZ") })}</>
        )}
      </p>

      <div className="mb-4">
        {event.status === "active" ? (
          <button
            onClick={handleClose}
            disabled={lifecycleBusy}
            className="rounded-lg border border-red-300 bg-paper-2 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t("eventDetail.closeButton")}
          </button>
        ) : (
          <button
            onClick={handleReopen}
            disabled={lifecycleBusy}
            className="rounded-lg border border-pine/40 bg-paper-2 px-3 py-1.5 text-[13px] text-pine hover:bg-pine-bg disabled:opacity-50"
          >
            {t("eventDetail.reopenButton")}
          </button>
        )}
        {lifecycleError && <p className="mt-1.5 text-[13px] text-red-600">{t(`eventDetail.error.${lifecycleError}`)}</p>}
      </div>

      <div className="mb-6 flex gap-1 border-b border-mist">
        <button
          onClick={() => setTab("settings")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "settings" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("eventSettings.tabSettings")}
        </button>
        <button
          onClick={() => setTab("access")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "access" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("eventSettings.tabAccess")}
        </button>
        {moduleAccess.health && (
          <button
            onClick={() => setTab("health")}
            className={
              "border-b-2 px-3 py-2 text-[13px] font-medium " +
              (tab === "health" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
            }
          >
            {t("eventSettings.tabHealth")}
          </button>
        )}
      </div>

      {tab === "access" && <AccessTab eventId={id} t={t} />}

      {tab === "health" && (
        <div className="flex flex-col gap-6">
          <ListTemplateAdmin kind="med" scope="event" eventId={id} label={t("healthTemplatesPage.tabMeds")} />
          <ListTemplateAdmin kind="slot" scope="event" eventId={id} label={t("eventHealthTab.slotsLabel")} />
          <ListTemplateAdmin kind="situation" scope="event" eventId={id} label={t("healthTemplatesPage.tabSituations")} />
        </div>
      )}

      {tab === "settings" && (
      <>
      <div className="mb-6 flex flex-wrap gap-2">
        <a href={`/events/${id}/bills`} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {t("eventDetail.viewBillsLink", { count: String(billCount) })}
        </a>
        <a href={`/events/${id}/budget`} className="rounded-lg border border-mist bg-paper-2 px-4 py-2 text-[14px] text-ink hover:bg-paper">
          {t("eventDetail.viewBudgetLink")}
        </a>
        <a href={`/events/${id}/payments`} className="rounded-lg border border-mist bg-paper-2 px-4 py-2 text-[14px] text-ink hover:bg-paper">
          {t("eventDetail.viewPaymentsLink")}
        </a>
      </div>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-3 text-[16px] font-semibold text-ink">{t("eventDetail.categoriesTitle")}</h2>

      <div className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className="border-b border-mist text-left">
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colCategory")}</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colBudget")}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-mist/60">
                <td className="p-2 text-[14px] text-ink">
                  <div>{cat.name}</div>
                  {cat.description && <div className="text-[12px] text-ink-secondary">{cat.description}</div>}
                </td>
                <td className="p-2 text-[14px] text-ink">
                  {editingId === cat.id ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-24 rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
                      autoFocus
                    />
                  ) : (
                    <span>{parseFloat(cat.budgetAmount).toLocaleString("cs-CZ")}</span>
                  )}
                </td>
                <td className="whitespace-nowrap p-2">
                  {editingId === cat.id ? (
                    <>
                      <button onClick={() => saveBudget(cat.id)} className="mr-3 text-[13px] text-pine hover:underline">
                        {t("common.save")}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-[13px] text-ink-secondary hover:underline">
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(cat)} className="mr-3 text-[13px] text-ember hover:underline">
                        {t("common.edit")}
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="text-[13px] text-red-600 hover:underline">
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-[14px] font-semibold text-ink">{t("eventDetail.total")}</td>
              <td className="p-2 text-[14px] font-semibold text-ink">{totalBudget.toLocaleString("cs-CZ")} Kč</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <form onSubmit={handleAddCategory} className="mb-8 flex gap-2">
        <input
          type="text"
          placeholder={t("eventDetail.newCategoryPlaceholder")}
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          className="flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
        />
        <button type="submit" className={btnPrimary}>
          {t("eventDetail.addCategory")}
        </button>
      </form>

      <h2 className="mb-3 text-[16px] font-semibold text-ink">{t("driveSettings.title")}</h2>

      <p className="mb-1 text-[14px] text-ink-secondary">{t("driveSettings.instructionsIntro")}</p>
      <p className="mb-2 break-all rounded-lg bg-paper-2 p-2 font-mono text-[13px] text-ink">
        {driveAccountEmail || "…"}
      </p>
      <p className="mb-4 whitespace-pre-line text-[13px] text-ink-secondary">{t("driveSettings.instructionsSteps")}</p>

      <form onSubmit={handleSaveDriveFolders} className="mb-1 flex max-w-md flex-col gap-2">
        <label className="text-[13px] text-ink-secondary">
          {t("driveSettings.ingestFolderLabel")}
          <input
            type="text"
            value={ingestFolderId}
            onChange={(e) => setIngestFolderId(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
        <label className="text-[13px] text-ink-secondary">
          {t("driveSettings.exportFolderLabel")}
          <input
            type="text"
            value={exportFolderId}
            onChange={(e) => setExportFolderId(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
        <p className="text-[12px] text-ink-secondary">{t("driveSettings.folderIdHint")}</p>

        {driveError && <p className="text-[13px] text-red-600">{driveError}</p>}

        <div className="mt-1">
          <button type="submit" disabled={driveSaving} className={btnPrimary}>
            {t("driveSettings.saveFolders")}
          </button>
        </div>
      </form>

      {!hasFolderInput && <p className="mt-2 text-[12px] text-ink-secondary">{t("driveSettings.noFoldersSet")}</p>}

      <div className="mt-6 border-t border-mist pt-6">
        <button
          type="button"
          onClick={handleExportNow}
          disabled={exporting || !event.driveExportFolderId}
          className={btnPrimary}
        >
          {exporting ? t("driveSettings.exporting") : t("driveSettings.exportButton")}
        </button>

        {!event.driveExportFolderId && (
          <p className="mt-2 text-[12px] text-ink-secondary">{t("driveSettings.exportNoFolderSet")}</p>
        )}

        {exportError && (
          <p className="mt-2 text-[14px] text-red-600">
            {t(`driveSettings.error.${exportError}`) || t("driveSettings.error.exportGeneric")}
          </p>
        )}

        {exportResult && (
          <div className="mt-3 text-[14px] text-ink">
            <p>
              {t("driveSettings.exportResultSummary", {
                total: String(exportResult.totalApproved),
                new: String(exportResult.newlyExported),
                already: String(exportResult.alreadyExported),
              })}
            </p>
            <a
              href={`https://docs.google.com/spreadsheets/d/${exportResult.manifestSpreadsheetId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ember hover:underline"
            >
              {t("driveSettings.exportOpenManifest")}
            </a>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function AccessTab({ eventId, t }: { eventId: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [modRes, accessRes] = await Promise.all([
      fetch(`/api/events/${eventId}/modules`),
      fetch(`/api/events/${eventId}/module-access`),
    ]);
    if (modRes.ok) setModules(await modRes.json());
    if (accessRes.ok) {
      setRows(await accessRes.json());
    } else if (accessRes.status === 403) {
      // Non-admins can see the module toggles but not the user grid.
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function toggleModule(moduleKey: ModuleKey, enabled: boolean) {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/modules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleKey, enabled }),
    });
    if (!res.ok) {
      setError(t("accessTab.errorSaveFailed"));
      return;
    }
    load();
  }

  async function toggleGrant(userId: string, moduleKey: ModuleKey, grant: boolean) {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/module-access`, {
      method: grant ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, moduleKey }),
    });
    if (!res.ok) {
      setError(t("accessTab.errorSaveFailed"));
      return;
    }
    load();
  }

  if (loading) return <div className="p-4 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const moduleLabel = (key: ModuleKey) => (key === "bills" ? t("accessTab.moduleBills") : t("accessTab.moduleHealth"));

  return (
    <div>
      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-3 text-[16px] font-semibold text-ink">{t("accessTab.modulesTitle")}</h2>
      <div className="mb-8 flex flex-col gap-2">
        {modules.map((m) => (
          <label key={m.moduleKey} className="flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) => toggleModule(m.moduleKey, e.target.checked)}
              className="h-4 w-4"
            />
            {moduleLabel(m.moduleKey)}
            <span className="text-[12px] text-ink-secondary">({t("accessTab.moduleEnabledHint")})</span>
          </label>
        ))}
      </div>

      {rows.length > 0 && (
        <>
          <h2 className="mb-3 text-[16px] font-semibold text-ink">{t("accessTab.usersTitle")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="border-b border-mist text-left">
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("accessTab.colUser")}</th>
                  {MODULE_KEYS.map((key) => (
                    <th key={key} className="p-2 text-[12px] font-medium text-ink-secondary">
                      {moduleLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-mist/60">
                    <td className="p-2 text-[14px] text-ink">
                      {row.displayName}
                      <div className="text-[12px] text-ink-secondary">{row.email}</div>
                    </td>
                    {MODULE_KEYS.map((key) => {
                      const shortcut =
                        row.role === "admin" || (row.role === "accountant" && key === "bills");
                      return (
                        <td key={key} className="p-2 text-[14px] text-ink">
                          {shortcut ? (
                            <span className="text-[12px] text-ink-secondary">
                              {row.role === "admin"
                                ? t("accessTab.shortcutAdmin")
                                : t("accessTab.shortcutAccountant")}
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={row.access[key]}
                              onChange={(e) => toggleGrant(row.id, key, e.target.checked)}
                              className="h-4 w-4"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
