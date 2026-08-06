"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type EventDetail = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "closed";
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

type FolderCheckResult = {
  accessible: boolean;
  name?: string;
  errorCode?: string;
};

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

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
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{
    ingest?: FolderCheckResult;
    export?: FolderCheckResult;
  } | null>(null);

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
  }, [id]);

  useEffect(() => {
    fetch("/api/config/drive-account")
      .then((r) => r.json())
      .then((d) => setDriveAccountEmail(d.email || ""))
      .catch(() => {});
  }, []);

  // Seed the folder-id inputs only once, when the event first loads —
  // not on every load() (e.g. after saving a budget), so it doesn't
  // clobber unsaved edits in these two fields.
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
    setTestResults(null);
    load();
  }

  async function handleTestConnection() {
    setDriveError(null);
    setTesting(true);
    setTestResults(null);
    const res = await fetch(`/api/events/${id}/drive-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingestFolderId: ingestFolderId.trim() || null,
        exportFolderId: exportFolderId.trim() || null,
      }),
    });
    setTesting(false);
    if (!res.ok) {
      setDriveError(t("driveSettings.errorSaveFailed"));
      return;
    }
    setTestResults(await res.json());
  }

  if (loading) return <div style={{ padding: "2rem" }}>{t("common.loading")}</div>;
  if (!event) return <div style={{ padding: "2rem" }}>{t("eventDetail.notFound")}</div>;

  const totalBudget = categories.reduce((sum, c) => sum + parseFloat(c.budgetAmount || "0"), 0);
  const hasFolderInput = !!(ingestFolderId.trim() || exportFolderId.trim());

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <a href="/events" style={{ color: "#666", textDecoration: "none", fontSize: "0.9rem" }}>
        ← {t("eventDetail.back")}
      </a>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0" }}>{event.name}</h1>
      <p style={{ color: "#666", marginBottom: "0.75rem" }}>
        {new Date(event.startDate).toLocaleDateString("cs-CZ")} –{" "}
        {new Date(event.endDate).toLocaleDateString("cs-CZ")} ·{" "}
        {event.status === "active" ? t("common.statusActive") : t("common.statusClosed")}
      </p>

      <a 
        href={`/events/${id}/bills`}
        style={{
          display: "inline-block",
          marginBottom: "1.5rem",
          padding: "0.5rem 1rem",
          background: "#111",
          color: "#fff",
          borderRadius: 4,
          textDecoration: "none",
        }}
      >
        {t("eventDetail.viewBillsLink", { count: String(billCount) })}
      </a>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        {t("eventDetail.categoriesTitle")}
      </h2>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: "0.5rem" }}>{t("eventDetail.colCategory")}</th>
            <th style={{ padding: "0.5rem" }}>{t("eventDetail.colBudget")}</th>
            <th style={{ padding: "0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.5rem" }}>
                <div>{cat.name}</div>
                {cat.description && (
                  <div style={{ fontSize: "0.8rem", color: "#888" }}>{cat.description}</div>
                )}
              </td>
              <td style={{ padding: "0.5rem" }}>
                {editingId === cat.id ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{ width: 100, padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                    autoFocus
                  />
                ) : (
                  <span>{parseFloat(cat.budgetAmount).toLocaleString("cs-CZ")}</span>
                )}
              </td>
              <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                {editingId === cat.id ? (
                  <>
                    <button
                      onClick={() => saveBudget(cat.id)}
                      style={{ marginRight: "0.5rem", color: "#080", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ color: "#666", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.cancel")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(cat)}
                      style={{ marginRight: "0.5rem", color: "#0645AD", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      style={{ color: "#c00", background: "none", border: "none", cursor: "pointer" }}
                    >
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
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>{t("eventDetail.total")}</td>
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>
              {totalBudget.toLocaleString("cs-CZ")} Kč
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <form onSubmit={handleAddCategory} style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder={t("eventDetail.newCategoryPlaceholder")}
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          style={{ flex: 1, padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4 }}>
          {t("eventDetail.addCategory")}
        </button>
      </form>

      <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        {t("driveSettings.title")}
      </h2>

      <p style={{ fontSize: "0.9rem", color: "#444", marginBottom: "0.25rem" }}>
        {t("driveSettings.instructionsIntro")}
      </p>
      <p
        style={{
          fontSize: "0.9rem",
          fontFamily: "monospace",
          background: "#f4f4f4",
          padding: "0.5rem",
          borderRadius: 4,
          marginBottom: "0.5rem",
          wordBreak: "break-all",
        }}
      >
        {driveAccountEmail || "…"}
      </p>
      <p style={{ fontSize: "0.85rem", color: "#666", whiteSpace: "pre-line", marginBottom: "1rem" }}>
        {t("driveSettings.instructionsSteps")}
      </p>

      <form onSubmit={handleSaveDriveFolders} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 500 }}>
        <label style={{ fontSize: "0.85rem", color: "#444" }}>
          {t("driveSettings.ingestFolderLabel")}
          <input
            type="text"
            value={ingestFolderId}
            onChange={(e) => setIngestFolderId(e.target.value)}
            style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ fontSize: "0.85rem", color: "#444" }}>
          {t("driveSettings.exportFolderLabel")}
          <input
            type="text"
            value={exportFolderId}
            onChange={(e) => setExportFolderId(e.target.value)}
            style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, marginTop: "0.25rem" }}
          />
        </label>
        <p style={{ fontSize: "0.8rem", color: "#888", margin: 0 }}>{t("driveSettings.folderIdHint")}</p>

        {driveError && <p style={{ color: "red", margin: 0 }}>{driveError}</p>}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          <button
            type="submit"
            disabled={driveSaving}
            style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4, border: "none", cursor: "pointer" }}
          >
            {t("driveSettings.saveFolders")}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !hasFolderInput}
            style={{ padding: "0.5rem 1rem", background: "#fff", color: "#111", border: "1px solid #111", borderRadius: 4, cursor: "pointer" }}
          >
            {testing ? t("driveSettings.testing") : t("driveSettings.testConnection")}
          </button>
        </div>
      </form>

      {!hasFolderInput && (
        <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.5rem" }}>
          {t("driveSettings.noFoldersSet")}
        </p>
      )}

      {testResults && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          {testResults.ingest && (
            <div style={{ color: testResults.ingest.accessible ? "#080" : "#c00" }}>
              {t("driveSettings.testResultIngestLabel")}{" "}
              {testResults.ingest.accessible
                ? t("driveSettings.testResultAccessible", { name: testResults.ingest.name ?? "" })
                : t(`driveSettings.error.${testResults.ingest.errorCode}`)}
            </div>
          )}
          {testResults.export && (
            <div style={{ color: testResults.export.accessible ? "#080" : "#c00" }}>
              {t("driveSettings.testResultExportLabel")}{" "}
              {testResults.export.accessible
                ? t("driveSettings.testResultAccessible", { name: testResults.export.name ?? "" })
                : t(`driveSettings.error.${testResults.export.errorCode}`)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}