"use client";

import { useCallback, useEffect, useState } from "react";

// Nastavení akce -> Pošta (2026-11-27, src/lib/automation.ts): automatic e-mails ("when <condition>, send <own
// template>") and the CC rule (a field's options -> e-mail addresses, e.g. the group leader of each oddíl).
type T = (key: string, vars?: Record<string, string>) => string;
type Condition = { key: string; label: string | null };
type Rule = { id: string; condition: string; purposeKey: string; active: boolean; sent: number };
type CcRule = { fieldKey: string; map: Record<string, string>; noticeSubject: string; noticeBody: string };
export type AutomationView = {
  hasSender: boolean;
  conditions: Condition[];
  templates: { purposeKey: string; name: string }[];
  rules: Rule[];
  ccRule: CcRule | null;
  emailCc: Record<string, "copy" | "notice">;
  selectFields: { key: string; label: string; options: string[] }[];
};

const card = "rounded-lg border border-mist p-3";
const input = "rounded-lg border border-mist bg-paper px-2 py-1 text-[13px] text-ink";
const btn = "rounded-lg border border-mist px-3 py-1 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export const conditionLabel = (c: Condition, t: T) => (c.label ? t("automation.cond.doc", { doc: c.label }) : t(`automation.cond.${c.key}`));

export default function AutomationSettings({ eventId, t }: { eventId: string; t: T }) {
  const url = `/api/events/${eventId}/automation`;
  const [data, setData] = useState<AutomationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({ condition: "complete", purposeKey: "", sendToExisting: false });
  const [cc, setCc] = useState<CcRule | null>(null);

  const apply = useCallback((d: AutomationView) => {
    setData(d);
    setCc(d.ccRule);
  }, []);
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && apply(d))
      .catch(() => {});
  }, [url, apply]);

  async function post(body: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t("automation.failed"));
    apply(await res.json());
  }

  if (!data) return null;
  const condOf = (key: string) => data.conditions.find((c) => c.key === key);
  const field = cc ? data.selectFields.find((f) => f.key === cc.fieldKey) : null;

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h3 className="text-[15px] font-semibold text-ink">{t("automation.rulesTitle")}</h3>
        <p className="mb-2 text-[12.5px] text-ink-secondary">{t("automation.rulesHint")}</p>
        {!data.hasSender && <p className="mb-2 text-[12.5px] text-amber-800">{t("automation.noSender")}</p>}
        {error && <p className="mb-2 text-[12.5px] text-red-600">{error}</p>}
        {data.rules.length === 0 && <p className="text-[13px] text-ink-secondary">{t("automation.noRules")}</p>}
        {data.rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-mist/60 py-1.5 text-[13px] last:border-0">
            <span className="text-ink">
              {t("automation.when")} <b>{condOf(r.condition) ? conditionLabel(condOf(r.condition)!, t) : r.condition}</b> → {t("automation.send")}{" "}
              <b>{data.templates.find((x) => x.purposeKey === r.purposeKey)?.name ?? r.purposeKey}</b>
            </span>
            <span className="text-[12px] text-ink-secondary">{t("automation.sentCount", { n: String(r.sent) })}</span>
            <label className="ml-auto flex items-center gap-1 text-[12.5px]">
              <input type="checkbox" checked={r.active} disabled={busy} onChange={(e) => post({ action: "setRule", id: r.id, active: e.target.checked })} />
              {t("automation.active")}
            </label>
            <button type="button" disabled={busy} onClick={() => confirm(t("automation.deleteConfirm")) && post({ action: "deleteRule", id: r.id })} className="text-[12.5px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-paper-2 p-2 text-[13px]">
          {t("automation.when")}
          <select value={newRule.condition} onChange={(e) => setNewRule({ ...newRule, condition: e.target.value })} className={input}>
            {data.conditions.map((c) => (
              <option key={c.key} value={c.key}>{conditionLabel(c, t)}</option>
            ))}
          </select>
          → {t("automation.send")}
          <select value={newRule.purposeKey} onChange={(e) => setNewRule({ ...newRule, purposeKey: e.target.value })} className={input}>
            <option value="">{t("automation.pickTemplate")}</option>
            {data.templates.map((x) => (
              <option key={x.purposeKey} value={x.purposeKey}>{x.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[12.5px] text-ink-secondary">
            <input type="checkbox" checked={newRule.sendToExisting} onChange={(e) => setNewRule({ ...newRule, sendToExisting: e.target.checked })} />
            {t("automation.sendToExisting")}
          </label>
          <button type="button" disabled={busy || !newRule.purposeKey} onClick={() => post({ action: "addRule", ...newRule })} className={btnPrimary}>
            {t("automation.add")}
          </button>
        </div>
        {data.templates.length === 0 && <p className="mt-1 text-[12px] text-ink-secondary">{t("automation.noTemplates")}</p>}
      </section>

      <section className={card}>
        <h3 className="text-[15px] font-semibold text-ink">{t("automation.ccTitle")}</h3>
        <p className="mb-2 text-[12.5px] text-ink-secondary">{t("automation.ccHint")}</p>
        <label className="text-[13px] text-ink-secondary">
          {t("automation.ccField")}{" "}
          <select
            value={cc?.fieldKey ?? ""}
            onChange={(e) => setCc(e.target.value ? { fieldKey: e.target.value, map: {}, noticeSubject: cc?.noticeSubject ?? "", noticeBody: cc?.noticeBody ?? "" } : null)}
            className={input}
          >
            <option value="">{t("automation.ccOff")}</option>
            {data.selectFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </label>
        {cc && field && (
          <div className="mt-2 flex flex-col gap-2">
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {field.options.map((o) => (
                  <tr key={o} className="border-b border-mist/60">
                    <td className="p-1.5 text-ink">{o}</td>
                    <td className="p-1.5">
                      <input value={cc.map[o] ?? ""} onChange={(e) => setCc({ ...cc, map: { ...cc.map, [o]: e.target.value } })} placeholder="vedouci@example.cz, druhy@example.cz" className={input + " w-full"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="text-[13px]">
              <summary className="cursor-pointer text-ink-secondary">{t("automation.noticeTitle")}</summary>
              <p className="my-1 text-[12px] text-ink-secondary">{t("automation.noticeHint")}</p>
              <input value={cc.noticeSubject} onChange={(e) => setCc({ ...cc, noticeSubject: e.target.value })} className={input + " mb-1 w-full"} />
              <textarea rows={5} value={cc.noticeBody} onChange={(e) => setCc({ ...cc, noticeBody: e.target.value })} className={input + " w-full"} />
            </details>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={() => post({ action: "saveCc", ccRule: cc })} className={btn}>
            {t("common.save")}
          </button>
          <span className="text-[12px] text-ink-secondary">{t("automation.ccPerTemplate")}</span>
        </div>
      </section>
    </div>
  );
}

/** Under an e-mail template: what the CC rule's addresses get for this e-mail. */
export function TemplateCcChoice({ eventId, purposeKey, t }: { eventId: string; purposeKey: string; t: T }) {
  const url = `/api/events/${eventId}/automation`;
  const [mode, setMode] = useState<"" | "copy" | "notice">("");
  const [ruleSet, setRuleSet] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AutomationView | null) => {
        if (!d) return;
        setRuleSet(!!d.ccRule);
        setMode(d.emailCc[purposeKey] ?? "");
      })
      .catch(() => {});
  }, [url, purposeKey]);
  if (ruleSet === null) return null;
  return (
    <div className="mb-3 rounded-lg border border-mist p-3 text-[13px]">
      <label className="text-ink">
        {t("automation.ccForTemplate")}{" "}
        <select
          value={mode}
          disabled={!ruleSet}
          onChange={async (e) => {
            const next = e.target.value as "" | "copy" | "notice";
            setMode(next);
            await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setEmailCc", purposeKey, mode: next || null }) }).catch(() => null);
          }}
          className={input}
        >
          <option value="">{t("automation.ccNone")}</option>
          <option value="copy">{t("automation.ccCopy")}</option>
          <option value="notice">{t("automation.ccNotice")}</option>
        </select>
      </label>
      {!ruleSet && <p className="mt-1 text-[12px] text-ink-secondary">{t("automation.ccNoRule")}</p>}
    </div>
  );
}
