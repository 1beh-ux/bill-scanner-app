"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";

// "Importovat z Drive" (docs/registration-slice7-spec.md): a folder of signed
// "platí trvale" forms into the people's profiles. Preview (who each file
// belongs to, editable), then the import in batches of 10 per request so no
// request runs long. API: /api/events/<id>/list-items/<itemId>/drive-import.

type Status = "matched" | "multiple" | "unmatched" | "already" | "skipped";
type Person = { id: string; name: string; dateOfBirth: string | null; participant: boolean };
type Row = {
  id: string;
  name: string;
  webViewLink: string;
  status: Status;
  reason: "native" | "type" | "size" | null;
  matches: string[];
  // Client side: the picked person, the picker text, skip, and the import result.
  childId: string | null;
  pick: string;
  skip: boolean;
  result?: string;
};

const BATCH = 10;
const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

// Same label as the add-participant picker; the birth date tells namesakes apart.
const personLabel = (p: Person) =>
  `${p.name} (${p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—"})`;

export default function DriveDocImport({ eventId, itemId, typeName, onClose }: { eventId: string; itemId: string; typeName: string; onClose: () => void }) {
  const { t } = useTranslations();
  const url = `/api/events/${eventId}/list-items/${itemId}/drive-import`;
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const byId = new Map(people.map((p) => [p.id, p]));
  const patch = (id: string, p: Partial<Row>) => setRows((prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const errorText = (code: string, info: { identity?: string; serviceAccount?: string; folderId?: string } = {}) =>
    ["not_found", "bad_file", "already", "failed"].includes(code) ? t(`driveDocImport.error.${code}`) : driveErrorText(t, code, { identity, ...info });

  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRows(null);
    const res = await fetch(`${url}?folder=${encodeURIComponent(folder)}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(errorText(data.error ?? "drive_unknown", data));
    const ppl: Person[] = data.people;
    setPeople(ppl);
    setIdentity(data.identity);
    setRows(
      (data.files as Omit<Row, "childId" | "pick" | "skip">[]).map((f) => {
        const one = f.status === "matched" ? ppl.find((p) => p.id === f.matches[0]) : undefined;
        return { ...f, childId: one?.id ?? null, pick: one ? personLabel(one) : "", skip: f.status === "already" || f.status === "skipped" };
      })
    );
  }

  const todo = (rows ?? []).filter((r) => r.childId && !r.skip && r.status !== "skipped" && r.result !== "ok");

  async function runImport() {
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map((r) => ({ fileId: r.id, childId: r.childId, force: r.status === "already" })) }),
      }).catch(() => null);
      const data: { results?: { fileId: string; ok?: boolean; error?: string }[] } = res?.ok ? await res.json() : {};
      for (const r of batch) {
        const out = data.results?.find((x) => x.fileId === r.id);
        patch(r.id, { result: out?.ok ? "ok" : errorText(out?.error ?? "failed") });
      }
      setProgress({ done: Math.min(i + BATCH, todo.length), total: todo.length });
    }
  }

  const running = !!progress && progress.done < progress.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-paper p-5">
        <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("driveDocImport.title", { name: typeName })}</h2>
        <p className="mb-3 text-[12.5px] text-ink-secondary">{t("driveDocImport.hint")}</p>
        <form onSubmit={preview} className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder={t("driveDocImport.folderPlaceholder")}
            className={inputClass + " py-2 text-[14px]"}
            autoFocus
          />
          <button type="submit" disabled={loading || running || !folder.trim()} className="shrink-0 rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
            {loading ? t("common.loading") : t("driveDocImport.load")}
          </button>
        </form>
        {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

        {rows && rows.length === 0 && <p className="text-[13px] text-ink-secondary">{t("driveDocImport.empty")}</p>}
        {rows && rows.length > 0 && (
          <>
            <datalist id="drive-doc-import-people">
              {people.map((p) => (
                <option key={p.id} value={personLabel(p)} />
              ))}
            </datalist>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-ink-secondary">
                    <th className="py-1 pr-2 font-medium">{t("driveDocImport.file")}</th>
                    <th className="py-1 pr-2 font-medium">{t("driveDocImport.statusHeader")}</th>
                    <th className="py-1 pr-2 font-medium">{t("driveDocImport.person")}</th>
                    <th className="py-1 font-medium">{t("driveDocImport.skip")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-mist/60 align-top">
                      <td className="py-1.5 pr-2 text-ink">
                        <span className="break-all">{r.name}</span>{" "}
                        <a href={r.webViewLink} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                          {t("driveDocImport.open")}
                        </a>
                      </td>
                      <td className="py-1.5 pr-2 text-ink-secondary">
                        {t(`driveDocImport.status.${r.status}`)}
                        {r.reason && <span className="block text-[11.5px]">{t(`driveDocImport.reason.${r.reason}`)}</span>}
                        {r.result && <span className={"block text-[11.5px] " + (r.result === "ok" ? "text-green-700" : "text-red-600")}>{r.result === "ok" ? t("driveDocImport.imported") : r.result}</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        {r.status !== "skipped" && (
                          <>
                            <input
                              list="drive-doc-import-people"
                              value={r.pick}
                              disabled={running || r.result === "ok"}
                              onChange={(e) => patch(r.id, { pick: e.target.value, childId: people.find((p) => personLabel(p) === e.target.value)?.id ?? null })}
                              className={inputClass}
                            />
                            {r.status === "multiple" && (
                              <span className="mt-1 flex flex-wrap gap-x-2 text-[11.5px]">
                                {r.matches.map((id) => byId.get(id)).filter((p): p is Person => !!p).map((p) => (
                                  <button key={p.id} type="button" onClick={() => patch(r.id, { pick: personLabel(p), childId: p.id })} className="text-ember hover:underline">
                                    {personLabel(p)}
                                    {p.participant && ` · ${t("driveDocImport.inEvent")}`}
                                  </button>
                                ))}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-1.5">
                        <input type="checkbox" checked={r.skip} disabled={r.status === "skipped" || running || r.result === "ok"} onChange={(e) => patch(r.id, { skip: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {progress && <span className="mr-auto text-[13px] text-ink-secondary">{t("driveDocImport.progress", { done: String(progress.done), total: String(progress.total) })}</span>}
          <button onClick={onClose} disabled={running} className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50">
            {t("common.close")}
          </button>
          {rows && (
            <button onClick={runImport} disabled={running || todo.length === 0} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
              {t("driveDocImport.confirm", { count: String(todo.length) })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
