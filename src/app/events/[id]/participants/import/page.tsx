"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { driveErrorText } from "@/lib/drive-error-messages";
import SyncEditor, { CountsLine } from "@/components/participants/SyncEditor";
import { MATCH_BY_NAME, REGNUM_TARGET, type FieldInfo } from "@/lib/participant-sync";
import type { PublicSync } from "@/lib/participant-sync-run";

// Participant import: saved table connections (registration form, health
// form, ...) that sync on demand or automatically, plus a one-off paste.
// Matching, preview and the writes all happen server-side
// (src/lib/participant-sync.ts + participant-sync-run.ts).
type Editing = { mode: "sheet"; sync: PublicSync | null } | { mode: "paste" };

export default function ParticipantImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [syncs, setSyncs] = useState<PublicSync[] | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [identityEmail, setIdentityEmail] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch(`/api/events/${eventId}/participants/syncs`)
      .then((r) => (r.ok ? r.json() : { syncs: [] }))
      .then((d) => setSyncs(d.syncs))
      .catch(() => setSyncs([]));
  }, [eventId]);

  useEffect(() => {
    load();
    fetch(`/api/events/${eventId}/participant-fields?surface=import`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setFields)
      .catch(() => {});
    fetch(`/api/events/${eventId}/drive-identity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIdentityEmail(d?.identity?.email || ""))
      .catch(() => {});
  }, [eventId, load]);

  async function syncNow(s: PublicSync) {
    setRunning(s.id);
    setRunError((e) => ({ ...e, [s.id]: "" }));
    const res = await fetch(`/api/events/${eventId}/participants/syncs/${s.id}`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) setRunError((e) => ({ ...e, [s.id]: t(`participantSync.runError.${data?.error ?? "failed"}`) }));
    setRunning(null);
    load();
  }

  async function remove(s: PublicSync) {
    if (!(await confirm({ message: t("participantSync.confirmDelete", { name: s.name }), danger: true }))) return;
    await fetch(`/api/events/${eventId}/participants/syncs/${s.id}`, { method: "DELETE" });
    load();
  }

  const matchLabel = (key: string) =>
    key === MATCH_BY_NAME ? t("participantSync.matchByName") : key === REGNUM_TARGET ? t("participantSync.regNumber") : (fields.find((f) => f.key === key)?.label ?? key);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <a href={`/events/${eventId}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.centralTitle")}
      </a>
      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">{t("participantImportPage.title")}</h1>

      {editing ? (
        <SyncEditor
          key={editing.mode === "sheet" ? (editing.sync?.id ?? "new") : "paste"}
          eventId={eventId}
          mode={editing.mode}
          initial={editing.mode === "sheet" ? editing.sync : null}
          fields={fields}
          identityEmail={identityEmail}
          onClose={(changed) => {
            setEditing(null);
            if (changed) load();
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-[16px] font-semibold text-ink">{t("participantSync.listTitle")}</h2>
            <p className="text-[13px] text-ink-secondary">{t("participantSync.listHint")}</p>
            {syncs === null && <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>}
            {syncs?.length === 0 && <p className="text-[13px] text-ink-secondary">{t("participantSync.none")}</p>}
            {syncs?.map((s) => (
              <div key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-mist bg-paper-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{s.name}</span>
                    <a href={`https://docs.google.com/spreadsheets/d/${s.sheetId}`} target="_blank" rel="noreferrer" className="text-[12px] text-ember hover:underline">
                      {t("participantSync.openSheet")} ↗
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => syncNow(s)} disabled={running !== null} className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
                      {running === s.id ? t("common.loading") : t("participantSync.syncNow")}
                    </button>
                    <button onClick={() => setEditing({ mode: "sheet", sync: s })} className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2">
                      {t("participantSync.settings")}
                    </button>
                    <button onClick={() => remove(s)} className="rounded-lg px-2 py-1.5 text-[13px] text-red-600 hover:bg-red-50">
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
                <p className="text-[12px] text-ink-secondary">
                  {[
                    `${t("participantSync.matchBy")}: ${matchLabel(s.matchBy)}`,
                    t(`participantSync.onNew.${s.onNew}`),
                    t(`participantSync.onMatch.${s.onMatch}`),
                    s.autoSync ? t("participantSync.autoEvery", { hours: String(s.everyHours) }) : t("participantSync.autoOff"),
                  ].join(" · ")}
                </p>
                <div className="text-[13px] text-ink">
                  {s.lastSync ? (
                    <>
                      <span className="text-ink-secondary">
                        {t(s.lastSync.auto ? "participantSync.lastAuto" : "participantSync.lastManual", { at: new Date(s.lastSync.at).toLocaleString("cs-CZ") })}:{" "}
                      </span>
                      {s.lastSync.error ? (
                        <span className="text-red-600">{driveErrorText(t, s.lastSync.error.code, { identity: s.lastSync.error.params?.identity || identityEmail })}</span>
                      ) : (
                        <CountsLine counts={s.lastSync.counts} />
                      )}
                    </>
                  ) : (
                    <span className="text-ink-secondary">{t("participantSync.never")}</span>
                  )}
                </div>
                {runError[s.id] && <p className="text-[13px] text-red-600">{runError[s.id]}</p>}
                {s.lastSync && s.lastSync.issues.length > 0 && (
                  <details className="text-[12px] text-ink-secondary">
                    <summary className="cursor-pointer text-amber-700">{t("participantSync.issues", { count: String(s.lastSync.issues.length) })}</summary>
                    <ul className="mt-1 flex flex-col gap-0.5 pl-4">
                      {s.lastSync.issues.map((i) => (
                        <li key={i.row}>
                          {t("participantSync.row", { row: String(i.row) })}: {i.code ? t(`participantSync.error.${i.code}`) : t(`participantSync.status.${i.status}`)}
                          {i.key ? ` (${i.key})` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setEditing({ mode: "sheet", sync: null })} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
                + {t("participantSync.add")}
              </button>
              <button onClick={() => setEditing({ mode: "paste" })} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2">
                {t("participantSync.paste")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
