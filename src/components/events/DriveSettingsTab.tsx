"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { parseFolderId } from "@/lib/drive-errors";
import { driveErrorText, type DriveErrorInfo } from "@/lib/drive-error-messages";

type Identity = {
  kind: "user" | "service_account";
  email: string;
  serviceAccountEmail: string;
  connectedAt: string | null;
  configuredBy: { id: string; displayName: string } | null;
  warning: "no_connection" | "token_invalid" | "user_inactive" | null;
};
type IdentityResponse = {
  identity: Identity;
  me: { connected: boolean; email: string | null; connectedAt: string | null; tokenInvalid: boolean };
  isConfiguredByMe: boolean;
  sameFolder: boolean;
};
type Label = "ingest" | "export" | "participants";
type FolderResult =
  | { ok: true; folderId: string; name: string }
  | { ok: false; folderId: string | null; error: string; params: DriveErrorInfo };
type ExportSummary = {
  totalApproved: number;
  newlyExported: number;
  alreadyExported: number;
  manifestSpreadsheetId: string;
  exportFailures?: { filename: string; error: string }[];
};

type EventDrive = {
  driveIngestFolderId: string | null;
  driveExportFolderId: string | null;
  driveParticipantsFolderId: string | null;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";

const FIELDS: { label: Label; field: "driveIngestFolderId" | "driveExportFolderId" | "driveParticipantsFolderId"; prop: keyof EventDrive; labelKey: string }[] = [
  { label: "ingest", field: "driveIngestFolderId", prop: "driveIngestFolderId", labelKey: "driveSettings.ingestFolderLabel" },
  { label: "export", field: "driveExportFolderId", prop: "driveExportFolderId", labelKey: "driveSettings.exportFolderLabel" },
  { label: "participants", field: "driveParticipantsFolderId", prop: "driveParticipantsFolderId", labelKey: "driveSettings.participantsFolderLabel" },
];

// The event's Drive settings: whose Google account does the work, the three
// folders (ids or pasted URLs), an explicit per-folder connection test, and the
// bills export. Every failure is shown as a precise, translated message that
// names the account and folder involved.
export default function DriveSettingsTab({
  eventId,
  event,
  driveConnect,
  onSaved,
}: {
  eventId: string;
  event: EventDrive & { driveExportFolderId: string | null };
  driveConnect: string | null;
  onSaved: () => void;
}) {
  const { t } = useTranslations();
  const [info, setInfo] = useState<IdentityResponse | null>(null);
  const [values, setValues] = useState<Record<Label, string>>({
    ingest: event.driveIngestFolderId ?? "",
    export: event.driveExportFolderId ?? "",
    participants: event.driveParticipantsFolderId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<{ code: string; field?: string } | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Partial<Record<Label, FolderResult>> | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<{ code: string; info: DriveErrorInfo } | null>(null);
  const [exportResult, setExportResult] = useState<ExportSummary | null>(null);

  const loadIdentity = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/drive-identity`);
    if (res.ok) setInfo(await res.json());
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}/drive-identity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setInfo(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const parsed: Record<Label, string | null> = {
    ingest: parseFolderId(values.ingest),
    export: parseFolderId(values.export),
    participants: parseFolderId(values.participants),
  };
  const sameFolder = !!parsed.ingest && parsed.ingest === parsed.export;
  const anyFolder = FIELDS.some((f) => values[f.label].trim());

  function setValue(label: Label, v: string) {
    setValues((prev) => ({ ...prev, [label]: v }));
    setSaved(false);
    setTestResults(null);
  }

  async function runTest(body?: Record<string, string>) {
    setTesting(true);
    const res = await fetch(`/api/events/${eventId}/drive-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setTesting(false);
    if (res.ok) setTestResults((await res.json()).results);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveIngestFolderId: values.ingest.trim() || null,
        driveExportFolderId: values.export.trim() || null,
        driveParticipantsFolderId: values.participants.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError({ code: data.error ?? "save_failed", field: data.field });
      return;
    }
    // Show the ids as saved (a pasted URL becomes its id) and check the connection right away.
    const ev = await res.json();
    setValues({ ingest: ev.driveIngestFolderId ?? "", export: ev.driveExportFolderId ?? "", participants: ev.driveParticipantsFolderId ?? "" });
    setSaved(true);
    onSaved();
    loadIdentity();
    runTest();
  }

  async function takeOver() {
    await fetch(`/api/events/${eventId}/drive-take-over`, { method: "POST" });
    loadIdentity();
  }

  async function doExport(recreateManifest = false) {
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    const res = await fetch(`/api/events/${eventId}/drive-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recreateManifest }),
    });
    setExporting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setExportError({ code: data.error ?? "drive_unknown", info: data });
      return;
    }
    setExportResult(data);
  }

  const identity = info?.identity;
  const fieldError = (label: Label) => (saveError?.code === "not_a_folder_id" && saveError.field === FIELDS.find((f) => f.label === label)?.field);

  return (
    <>
      <h2 className="mb-3 text-[16px] font-semibold text-ink">{t("driveSettings.title")}</h2>

      {/* --- whose Google account does this event's Drive work? --- */}
      <div className="mb-6 rounded-lg border border-mist bg-paper-2 p-3">
        <p className="mb-1 text-[14px] font-medium text-ink">{t("driveSettings.identityTitle")}</p>
        {!identity ? (
          <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
        ) : identity.kind === "user" ? (
          <p className="mb-2 text-[13px] text-ink">
            {t("driveSettings.identityUser", {
              email: identity.email,
              name: identity.configuredBy?.displayName ?? "",
              date: identity.connectedAt ? new Date(identity.connectedAt).toLocaleDateString("cs-CZ") : "",
            })}
          </p>
        ) : (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[13px] text-amber-900">
            <p className="font-medium">{t("driveSettings.identityFallback", { email: identity.email || "—" })}</p>
            {identity.warning && (
              <p>
                {t(`driveSettings.warning.${identity.warning}`, { name: identity.configuredBy?.displayName ?? "" })}
              </p>
            )}
          </div>
        )}

        {driveConnect === "connected" && <p className="mb-2 text-[13px] text-pine">{t("driveSettings.connectDone")}</p>}
        {driveConnect === "error" && <p className="mb-2 text-[13px] text-red-600">{t("driveSettings.connectError")}</p>}
        {driveConnect === "in_use" && <p className="mb-2 text-[13px] text-red-600">{t("driveSettings.connectInUse")}</p>}

        {info && (
          <p className="mb-2 text-[12px] text-ink-secondary">
            {info.me.connected
              ? t(info.me.tokenInvalid ? "driveSettings.meExpired" : "driveSettings.meConnected", { email: info.me.email ?? "" })
              : t("driveSettings.meNotConnected")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <a href={`/api/mail-oauth/authorize?eventId=${eventId}&purpose=drive`} className={btnSecondary}>
            {info?.me.connected ? t("driveSettings.reconnect") : t("driveSettings.connectMine")}
          </a>
          {info && !info.isConfiguredByMe && (
            <button type="button" onClick={takeOver} className={btnSecondary}>
              {t("driveSettings.takeOver")}
            </button>
          )}
        </div>
      </div>

      {/* --- what access is needed (replaces the old "share with the service account" text) --- */}
      <p className="mb-1 text-[13px] text-ink-secondary">
        {t("driveSettings.accessNeeded", { email: identity?.email || "…" })}
      </p>
      {identity?.kind === "service_account" && (
        <p className="mb-2 text-[13px] text-ink-secondary">
          {t("driveSettings.accessNeededSa", { email: identity.serviceAccountEmail })}
        </p>
      )}
      <p className="mb-4 text-[12px] text-ink-secondary">{t("driveSettings.accessRoles")}</p>

      {/* --- folders --- */}
      <form onSubmit={save} className="mb-1 flex max-w-xl flex-col gap-3">
        {FIELDS.map((f) => (
          <div key={f.label}>
            <label className="text-[13px] text-ink-secondary">
              {t(f.labelKey)}
              <input
                type="text"
                value={values[f.label]}
                onChange={(e) => setValue(f.label, e.target.value)}
                placeholder={t("driveSettings.folderPlaceholder")}
                className={inputClass + " mt-1"}
              />
            </label>
            {values[f.label].trim() &&
              (parsed[f.label] ? (
                parsed[f.label] !== values[f.label].trim() && (
                  <p className="mt-0.5 text-[12px] text-ink-secondary">
                    {t("driveSettings.resolvedId")} <code>{parsed[f.label]}</code>
                  </p>
                )
              ) : (
                <p className="mt-0.5 text-[12px] text-red-600">{driveErrorText(t, "not_a_folder_id", { folderLabel: f.label })}</p>
              ))}
            {fieldError(f.label) && (
              <p className="mt-0.5 text-[12px] text-red-600">{driveErrorText(t, "not_a_folder_id", { folderLabel: f.label })}</p>
            )}
            {testResults?.[f.label] && <FolderStatus result={testResults[f.label]!} />}
          </div>
        ))}
        <p className="text-[12px] text-ink-secondary">{t("driveSettings.participantsFolderHint")}</p>
        <p className="text-[12px] text-ink-secondary">{t("driveSettings.folderIdHint")}</p>
        {sameFolder && <p className="text-[13px] text-amber-700">{t("driveSettings.error.same_folder")}</p>}
        {saveError && saveError.code !== "not_a_folder_id" && <p className="text-[13px] text-red-600">{t("driveSettings.errorSaveFailed")}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? t("common.loading") : t("driveSettings.saveFolders")}
          </button>
          <button
            type="button"
            disabled={testing || !anyFolder}
            onClick={() =>
              runTest({ ingestFolderId: values.ingest, exportFolderId: values.export, participantsFolderId: values.participants })
            }
            className={btnSecondary}
          >
            {testing ? t("driveSettings.testing") : t("driveSettings.testConnection")}
          </button>
          {saved && <span className="text-[13px] text-pine">{t("driveSettings.saved")}</span>}
        </div>
      </form>
      {!anyFolder && <p className="mt-2 text-[12px] text-ink-secondary">{t("driveSettings.noFoldersSet")}</p>}

      {/* --- export --- */}
      <div className="mt-6 border-t border-mist pt-6">
        <button type="button" onClick={() => doExport(false)} disabled={exporting || !event.driveExportFolderId} className={btnPrimary}>
          {exporting ? t("driveSettings.exporting") : t("driveSettings.exportButton")}
        </button>
        {!event.driveExportFolderId && <p className="mt-2 text-[12px] text-ink-secondary">{t("driveSettings.exportNoFolderSet")}</p>}

        {exportError && (
          <div className="mt-2">
            <p className="text-[14px] text-red-600">{driveErrorText(t, exportError.code, exportError.info)}</p>
            {exportError.code === "manifest_missing" && (
              <button type="button" onClick={() => doExport(true)} disabled={exporting} className={btnSecondary + " mt-2"}>
                {t("driveSettings.recreateManifest")}
              </button>
            )}
          </div>
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
            {exportResult.exportFailures && exportResult.exportFailures.length > 0 && (
              <ul className="my-1 list-disc pl-5 text-[13px] text-red-600">
                {exportResult.exportFailures.map((f) => (
                  <li key={f.filename}>
                    {f.filename}: {driveErrorText(t, f.error, { identity: identity?.email, serviceAccount: identity?.serviceAccountEmail, folderLabel: "export" })}
                  </li>
                ))}
              </ul>
            )}
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
  );
}

function FolderStatus({ result }: { result: FolderResult }) {
  const { t } = useTranslations();
  return result.ok ? (
    <p className="mt-0.5 text-[12px] text-pine">✓ {t("driveSettings.testResultAccessible", { name: result.name })}</p>
  ) : (
    <p className="mt-0.5 text-[12px] text-red-600">✗ {driveErrorText(t, result.error, result.params)}</p>
  );
}
