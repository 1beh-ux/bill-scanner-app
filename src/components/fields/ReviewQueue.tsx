"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { NEW_PERSON } from "@/lib/participant-sync";

// Fields Manager phase 5 (design §10): "Ke kontrole" -- what automatic syncs held back. Each item: apply (once, or
// "always" = remembered on the connection) or dismiss. Writes go through the import path and can be undone there.
type Item = { id: string; syncId: string; kind: string; createdAt: string; payload: { rowNumber: number; headers: string[]; cells: string[]; name?: string; dateOfBirth?: string | null; candidates?: string[]; participantId?: string | null; changes?: { field: string; from: string; to: string }[]; values?: { field: string; value: string }[] } };
type Field = { key: string; label: string; fieldType: string; options: unknown };
type Data = { items: Item[]; syncs: { id: string; name: string }[]; participants: { id: string; name: string; dateOfBirth: string | null }[]; fields: Field[] };
const input = "rounded border border-mist bg-paper px-2 py-1 text-[13px]";

export default function ReviewQueue({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { t } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    fetch(`/api/events/${eventId}/review`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => !gone && setData(d))
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, [eventId, reload]);
  if (failed) return <p className="text-[13px] text-ink-secondary">{t("fieldsManager.loadFailed")}</p>;
  if (!data) return <p className="text-[13px] text-ink-secondary">{t("fieldsManager.loading")}</p>;
  if (!data.items.length) return <p className="rounded-xl border border-mist p-4 text-[13px] text-ink-secondary">{t("fieldsManager.review.empty")}</p>;
  const done = () => {
    setReload((n) => n + 1);
    onChanged();
  };
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-ink-secondary">{t("fieldsManager.review.help")}</p>
      {data.items.map((i) => (
        <ReviewCard key={i.id} item={i} data={data} eventId={eventId} onDone={done} />
      ))}
    </div>
  );
}

function ReviewCard({ item, data, eventId, onDone }: { item: Item; data: Data; eventId: string; onDone: () => void }) {
  const { t } = useTranslations();
  const p = item.payload;
  const [choice, setChoice] = useState(p.candidates?.[0] ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [always, setAlways] = useState(item.kind === "bad_value");
  const [error, setError] = useState<string | null>(null);
  const person = (id: string) => data.participants.find((x) => x.id === id);
  const label = (k: string) => data.fields.find((f) => f.key === k)?.label ?? k;
  const send = async (action: "apply" | "dismiss") => {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/review/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, choice, values, always }) }).catch(() => null);
    if (res?.ok) onDone();
    else setError(t("fieldsManager.err.failed"));
  };
  const options = (f?: Field) => (f?.fieldType === "boolean" || f?.fieldType === "consent" ? [["true", t("fieldsManager.yes")], ["false", t("fieldsManager.no")]] : (Array.isArray(f?.options) ? (f.options as string[]) : []).map((o) => [o, o]));

  return (
    <section className="rounded-xl border border-mist bg-paper p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[12px]">{t(`fieldsManager.review.kind.${item.kind}`)}</span>
        <span className="font-medium">{p.name ?? person(p.participantId ?? "")?.name ?? ""}</span>
        <span className="text-[12px] text-ink-secondary">
          {data.syncs.find((s) => s.id === item.syncId)?.name} · {t("fieldsManager.import.row", { n: String(p.rowNumber) })}
        </span>
        <details className="ml-auto text-[12px]">
          <summary className="cursor-pointer text-ink-secondary">{t("fieldsManager.review.wholeRow")}</summary>
          <table className="mt-1">
            <tbody>
              {p.headers.map((h, i) => (p.cells[i] ?? "").trim() ? (
                <tr key={h + i}>
                  <td className="pr-2 text-ink-secondary">{h}</td>
                  <td>{p.cells[i]}</td>
                </tr>
              ) : null)}
            </tbody>
          </table>
        </details>
      </div>

      {(item.kind === "possible_match" || item.kind === "unmatched") && (
        <label className="block">
          {t("fieldsManager.review.whoIsIt")}{" "}
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
            <option value="">—</option>
            <option value={NEW_PERSON}>{t("fieldsManager.review.newPerson")}</option>
            {[...(p.candidates ?? []), ...data.participants.map((x) => x.id).filter((id) => !p.candidates?.includes(id))].map((id) => {
              const x = person(id);
              return x ? <option key={id} value={id}>{x.name}{x.dateOfBirth ? ` (${x.dateOfBirth})` : ""}{p.candidates?.includes(id) ? " ★" : ""}</option> : null;
            })}
          </select>
          {p.dateOfBirth && <span className="ml-2 text-ink-secondary">{t("fieldsManager.review.tableDob", { d: p.dateOfBirth })}</span>}
        </label>
      )}

      {item.kind === "difference" &&
        p.changes?.map((c) => (
          <div key={c.field} className="grid grid-cols-3 gap-2 border-t border-mist py-1">
            <span>{label(c.field)}</span>
            <span className="text-ink-secondary">{t("fieldsManager.review.inApp")}: {c.from}</span>
            <span>{t("fieldsManager.review.inTable")}: {c.to}</span>
          </div>
        ))}

      {item.kind === "bad_value" &&
        p.values?.map((v) => (
          <div key={v.field + v.value} className="flex flex-wrap items-center gap-2 border-t border-mist py-1">
            <span>{label(v.field)}:</span>
            <span className="font-mono">{v.value}</span>
            <span>→</span>
            <select value={values[v.value] ?? ""} onChange={(e) => setValues({ ...values, [v.value]: e.target.value })} className={input}>
              <option value="">—</option>
              {options(data.fields.find((f) => f.key === v.field)).map(([val, text]) => (
                <option key={val} value={val}>{text}</option>
              ))}
            </select>
          </div>
        ))}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={(item.kind === "possible_match" || item.kind === "unmatched") && !choice}
          onClick={() => send("apply")}
          className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40"
        >
          {t(item.kind === "difference" ? "fieldsManager.review.useTable" : "fieldsManager.review.apply")}
        </button>
        {(item.kind === "difference" || item.kind === "bad_value") && (
          <label className="flex items-center gap-1 text-[12px]">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> {t("fieldsManager.review.always")}
          </label>
        )}
        <button type="button" onClick={() => send("dismiss")} className="rounded-lg border border-mist px-3 py-1 hover:bg-paper-2">
          {t(item.kind === "difference" ? "fieldsManager.review.keepApp" : "fieldsManager.review.dismiss")}
        </button>
        {error && <span className="text-red-700">{error}</span>}
      </div>
    </section>
  );
}
