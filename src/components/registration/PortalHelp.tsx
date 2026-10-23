"use client";

import { useState } from "react";

// Under the parent portal's sign-in screens (2026-10-23): "Zapomněl(a) jsem odkaz do portálu" -- an
// e-mail + a birth date of anyone in the portal; a matching link is e-mailed to that address
// (src/lib/portal-recovery.ts) -- and "Ještě nejsem členem organizace – registrovat".
type T = (key: string, vars?: Record<string, string>) => string;
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist px-3 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";

// t: the portal's translator; or `strings` from a server page (the landing), which can't pass a function.
export default function PortalHelp({ token, recovery, joinHref, t: tProp, strings }: { token?: string; recovery: boolean; joinHref: string | null; t?: T; strings?: Record<string, string> }) {
  const t: T = tProp ?? ((key) => strings?.[key] ?? key);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"sent" | "throttled" | "failed" | null>(null);
  if (!recovery && !joinHref) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/public/portal-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, birthDate, token }) }).catch(() => null);
    setBusy(false);
    setResult(res?.ok ? "sent" : res?.status === 429 ? "throttled" : "failed");
  }

  return (
    <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left">
      {recovery && !open && (
        <div>
          <button type="button" onClick={() => setOpen(true)} className={btn}>
            {t("portal.recoverButton")}
          </button>
          <p className="mt-1 text-[12.5px] text-ink-secondary">{t("portal.recoverNote")}</p>
        </div>
      )}
      {recovery && open && (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-mist p-3">
          <p className="text-[14px] font-semibold text-ink">{t("portal.recoverButton")}</p>
          <p className="text-[13px] text-ink-secondary">{t("portal.recoverHint")}</p>
          <label className="text-[13px] text-ink-secondary">
            {t("portal.recoverEmail")}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass + " mt-1"} />
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("portal.recoverBirthDate")}
            <input type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputClass + " mt-1"} />
          </label>
          {result && <p className={"text-[14px] " + (result === "sent" ? "text-ink" : "text-red-600")}>{t(`portal.recover.${result}`)}</p>}
          <button type="submit" disabled={busy || !email || !birthDate || result === "sent"} className="self-start rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
            {t("portal.recoverSubmit")}
          </button>
        </form>
      )}
      {joinHref && (
        <div>
          <a href={joinHref} className={btn + " inline-block"}>
            {t("portal.joinButton")}
          </a>
        </div>
      )}
    </div>
  );
}
