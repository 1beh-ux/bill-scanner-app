"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { TOKEN_VALID_DAYS } from "@/lib/bank/accounts";

// Organizace -> Připojení -> Banka (organization admin, docs/bank-payments-design.md):
// the organization's Fio accounts. The token is write-only: typed once, never shown again.
type Account = {
  id: string;
  label: string;
  accountNumber: string;
  bankCode: string;
  tokenSetAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  events: { id: string; name: string }[];
};

const DAY = 24 * 3600 * 1000;
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const linkBtn = "text-[13px] text-ember hover:underline disabled:opacity-50";
const when = (d: string) => new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });

export default function BankAccountsAdmin() {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  // When the list was loaded -- the token-expiry warning compares against it.
  const [now, setNow] = useState(0);
  const [form, setForm] = useState<{ label: string; accountNumber: string; token: string } | null>(null);
  const [tokenFor, setTokenFor] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/bank-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setAccounts(d?.accounts ?? []);
        setCanEdit(!!d?.canEdit);
        setNow(Date.now());
      })
      .catch(() => setAccounts([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const problem = (code: string) => t(`bankCheck.error.${code}`);

  async function saveToken(id: string, token: string) {
    const res = await fetch(`/api/bank-accounts/${id}/token`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    const status = res ? ((await res.json().catch(() => ({}))) as { status?: string }).status : "unreachable";
    setMessage(status === "ok" ? t("bankAccounts.tokenOk") : t("bankCheck.result.error", { problem: problem(status ?? "unreachable") }));
    return status !== "invalid_format";
  }

  async function connect() {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/bank-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: form.label, accountNumber: form.accountNumber }) }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      const error = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return setMessage(t(`bankAccounts.error.${error ?? "failed"}`));
    }
    const { id } = (await res.json()) as { id: string };
    if (form.token) await saveToken(id, form.token);
    setBusy(false);
    setForm(null);
    load();
  }

  async function replaceToken() {
    if (!tokenFor) return;
    setBusy(true);
    setMessage(null);
    if (await saveToken(tokenFor.id, tokenFor.token)) setTokenFor(null);
    setBusy(false);
    load();
  }

  async function checkNow(id: string) {
    setBusy(true);
    setMessage(null);
    const r = await fetch(`/api/bank-accounts/${id}/check`, { method: "POST" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    setBusy(false);
    setMessage(
      !r ? problem("unreachable")
        : r.status === "ok" ? (r.settled ? t("bankCheck.result.settled", { count: String(r.settled) }) : t("bankCheck.result.nothingNew"))
        : r.status === "throttled" ? t("bankCheck.result.throttled")
        : r.status === "nothing_to_do" ? t("bankAccounts.nothingToDo")
        : t("bankCheck.result.error", { problem: problem(r.code) })
    );
    load();
  }

  async function disconnect(a: Account) {
    let withMovements = false;
    const ok = await confirm({
      message: t("bankAccounts.disconnectConfirm", { label: a.label }),
      danger: true,
      confirmLabel: t("bankAccounts.disconnect"),
      option: { label: t("bankAccounts.deleteMovements"), onOption: (v) => (withMovements = v) },
    });
    if (!ok) return;
    await fetch(`/api/bank-accounts/${a.id}${withMovements ? "?withMovements=1" : ""}`, { method: "DELETE" }).catch(() => null);
    load();
  }

  if (!accounts || !canEdit) return null;

  return (
    <section className="mt-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-ink">{t("bankAccounts.title")}</h2>
        {!form && (
          <button type="button" className={linkBtn} onClick={() => { setMessage(null); setForm({ label: "", accountNumber: "", token: "" }); }}>
            + {t("bankAccounts.connect")}
          </button>
        )}
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("bankAccounts.subtitle")}</p>

      {form && (
        <div className="mb-4 flex max-w-xl flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
          <h3 className="text-[15px] font-semibold text-ink">{t("bankAccounts.connect")}</h3>
          <label className="text-[13px] text-ink-secondary">
            {t("bankAccounts.label")}
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass + " mt-1"} />
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("bankAccounts.accountNumber")}
            <span className="mt-1 flex items-center gap-2">
              <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} inputMode="numeric" placeholder="2900123456" className={inputClass} />
              <span className="text-[14px] text-ink">/2010</span>
            </span>
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("bankAccounts.token")}
            <input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} className={inputClass + " mt-1 font-mono"} />
          </label>
          <p className="text-[12px] text-ink-secondary">{t("bankAccounts.tokenHelp")}</p>
          {message && <p className="text-[13px] text-red-600">{message}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setForm(null)} className="text-[14px] text-ink-secondary hover:underline">{t("common.cancel")}</button>
            <button type="button" disabled={busy || !form.label.trim() || !form.accountNumber.trim()} onClick={connect} className={btnPrimary}>{t("bankAccounts.connectButton")}</button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("bankAccounts.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => {
            const expires = a.tokenSetAt ? new Date(new Date(a.tokenSetAt).getTime() + TOKEN_VALID_DAYS * DAY) : null;
            const expiringSoon = expires && expires.getTime() - now < 14 * DAY;
            return (
              <li key={a.id} className="flex flex-col gap-1 rounded-lg border border-mist bg-paper px-3 py-2 text-[14px]">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{a.label}</span>
                  <span className="text-[13px] text-ink-secondary">{a.accountNumber}/{a.bankCode}</span>
                </span>
                <span className="text-[13px]">
                  {!a.tokenSetAt ? (
                    <span className="text-ink-secondary">{t("bankAccounts.noToken")}</span>
                  ) : a.lastError ? (
                    <span className="text-red-600">{t("bankAccounts.problem", { problem: problem(a.lastError) })}</span>
                  ) : a.lastSuccessAt ? (
                    <span className="text-pine">{t("bankAccounts.lastOk", { when: when(a.lastSuccessAt) })}</span>
                  ) : (
                    <span className="text-ink-secondary">{t("bankAccounts.neverChecked")}</span>
                  )}
                </span>
                {expires && (
                  <span className={"text-[12.5px] " + (expiringSoon ? "rounded bg-amber-50 px-2 py-0.5 text-amber-800" : "text-ink-secondary")}>
                    {t(expires.getTime() < now ? "bankAccounts.tokenExpired" : expiringSoon ? "bankAccounts.tokenExpiresSoon" : "bankAccounts.tokenExpires", { date: expires.toLocaleDateString("cs-CZ") })}
                  </span>
                )}
                {a.events.length > 0 && (
                  <span className="text-[12.5px] text-ink-secondary">{t("bankAccounts.usedBy", { events: a.events.map((e) => e.name).join(", ") })}</span>
                )}
                {tokenFor?.id === a.id ? (
                  <span className="flex flex-col gap-2">
                    <input type="password" autoComplete="off" autoFocus value={tokenFor.token} onChange={(e) => setTokenFor({ id: a.id, token: e.target.value })} placeholder={t("bankAccounts.token")} className={inputClass + " font-mono"} />
                    <span className="text-[12px] text-ink-secondary">{t("bankAccounts.tokenHelp")}</span>
                    <span className="flex justify-end gap-3">
                      <button type="button" onClick={() => setTokenFor(null)} className="text-[13px] text-ink-secondary hover:underline">{t("common.cancel")}</button>
                      <button type="button" disabled={busy || !tokenFor.token} onClick={replaceToken} className={linkBtn}>{t("common.save")}</button>
                    </span>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    <button type="button" className={linkBtn} onClick={() => { setMessage(null); setTokenFor({ id: a.id, token: "" }); }}>{t(a.tokenSetAt ? "bankAccounts.replaceToken" : "bankAccounts.setToken")}</button>
                    {a.tokenSetAt && <button type="button" className={linkBtn} disabled={busy} onClick={() => checkNow(a.id)}>{t("bankAccounts.checkNow")}</button>}
                    {a.tokenSetAt && <button type="button" className={linkBtn} onClick={() => disconnect(a)}>{t("bankAccounts.disconnect")}</button>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!form && message && <p className="mt-3 text-[13px] text-ink">{message}</p>}
    </section>
  );
}
