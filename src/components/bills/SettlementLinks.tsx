"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useConfirm } from "@/components/ConfirmDialog";

// Vyúčtování on Platby (src/lib/settlement-links.ts): where people pay the event (the Pokladník's own account
// with their Fio token, or the event's Banka account), the links for everyone, and per person the link + what
// they marked there.
type T = (key: string, vars?: Record<string, string>) => string;
type State = {
  receiverMode: "treasurer" | "event";
  receiver: { kind: string; name: string; hasAccount: boolean; autoConfirm: boolean } | null;
  eventAccount: { label: string } | null;
  treasurer: { name: string; hasAccount: boolean; fioToken: boolean; fioLastSuccessAt: string | null; fioLastError: string | null } | null;
};
const inputSm = "rounded-lg border border-mist bg-paper px-2 py-1.5 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const full = (path: string) => `${window.location.origin}${path}`;

export default function SettlementLinks({ eventId, people, names, t, onChanged }: { eventId: string; people: string[]; names: Record<string, string>; t: T; onChanged: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [token, setToken] = useState("");
  const [list, setList] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/events/${eventId}/settlement-settings`;
  const load = useCallback(() => {
    fetch(url).then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => setSt(null));
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  async function patch(body: Record<string, unknown>) {
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) setSt(await r.json());
  }
  async function allLinks() {
    setBusy(true);
    const r = await fetch(`/api/events/${eventId}/settlement-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorIds: people }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return;
    const out = (await r.json()) as { authorId: string; path: string }[];
    setList(out.map((l) => `${names[l.authorId] ?? ""}: ${full(l.path)}`).join("\n"));
    onChanged();
  }
  if (!st) return null;
  return (
    <section className="mb-5 flex flex-col gap-2 rounded-lg border border-mist bg-paper p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-ink">{t("settlementLinks.receiver")}</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={st.receiverMode === "treasurer"} onChange={() => patch({ receiver: "treasurer" })} />
          {t("settlementLinks.receiverTreasurer", { name: st.treasurer?.name ?? "—" })}
        </label>
        <label className={"flex items-center gap-1.5 " + (st.eventAccount ? "" : "opacity-50")}>
          <input type="radio" disabled={!st.eventAccount} checked={st.receiverMode === "event"} onChange={() => patch({ receiver: "event" })} />
          {t("settlementLinks.receiverEvent", { name: st.eventAccount?.label ?? "—" })}
        </label>
      </div>
      {!st.treasurer && st.receiverMode === "treasurer" && <p className="text-amber-700">{t("settlementLinks.noTreasurer")}</p>}
      {st.receiver && !st.receiver.hasAccount && <p className="text-amber-700">{t("settlementLinks.noAccount", { name: st.receiver.name })}</p>}
      {st.receiverMode === "treasurer" && st.treasurer && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-secondary">{t("settlementLinks.fio", { name: st.treasurer.name })}</span>
          {st.treasurer.fioToken ? (
            <>
              <span className="rounded-full bg-pine/15 px-2 py-0.5 text-pine">{t("settlementLinks.fioSet")}</span>
              {st.treasurer.fioLastError && <span className="text-red-700">{t("settlementLinks.fioError", { code: st.treasurer.fioLastError })}</span>}
              <button type="button" onClick={() => patch({ fioToken: null })} className="text-red-600 hover:underline">
                {t("settlementLinks.fioRemove")}
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                patch({ fioToken: token });
                setToken("");
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("settlementLinks.fioPlaceholder")} autoComplete="off" className={inputSm + " w-64"} />
              <button type="submit" disabled={token.trim().length < 20} className={btn}>
                {t("common.save")}
              </button>
            </form>
          )}
        </div>
      )}
      <p className="text-[12px] text-ink-secondary">{st.receiver?.autoConfirm ? t("settlementLinks.autoOn") : t("settlementLinks.autoOff")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={allLinks} disabled={busy || !people.length} className={btn}>
          {t("settlementLinks.allLinks")}
        </button>
        <span className="text-[12px] text-ink-secondary">{t("settlementLinks.hint")}</span>
      </div>
      {list && (
        <div className="flex flex-col gap-1">
          <textarea readOnly value={list} rows={Math.min(12, list.split("\n").length + 1)} className={inputSm + " font-mono text-[12px]"} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={() => navigator.clipboard?.writeText(list)} className="self-start text-[12.5px] text-ember hover:underline">
            {t("settlementLinks.copyAll")}
          </button>
        </div>
      )}
    </section>
  );
}

/** One person on Platby: their link (copy / open / QR / new) and what they marked there. */
export function LinkCell({ eventId, authorId, link, t, onChanged }: { eventId: string; authorId: string; link: { path: string; claimedAt: string | null; receivedAt: string | null } | null; t: T; onChanged: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  async function make(reissue = false) {
    if (reissue && !(await confirm({ message: t("settlementLinks.reissueConfirm") }))) return;
    const r = await fetch(`/api/events/${eventId}/settlement-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, reissue }) }).catch(() => null);
    if (r?.ok) onChanged();
  }
  if (!link)
    return (
      <button type="button" onClick={() => make()} className="mt-2 block text-[13px] text-ember hover:underline">
        {t("settlementLinks.create")}
      </button>
    );
  return (
    <div className="mt-2 flex flex-col gap-1 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-secondary">{t("settlementLinks.link")}</span>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(full(link.path)); setCopied(true); }} className="text-ember hover:underline">
          {copied ? `✓ ${t("settlementLinks.copied")}` : t("settlementLinks.copy")}
        </button>
        <a href={link.path} target="_blank" rel="noreferrer" className="text-ember hover:underline">
          {t("settlementLinks.open")}
        </a>
        <button type="button" onClick={async () => setQr(qr ? null : await QRCode.toDataURL(full(link.path), { margin: 1, width: 160 }))} className="text-ember hover:underline">
          QR
        </button>
        <button type="button" onClick={() => make(true)} className="text-ink-secondary hover:underline" title={t("settlementLinks.reissueHint")}>
          {t("settlementLinks.reissue")}
        </button>
      </div>
      {link.claimedAt && <span className="text-amber-700">{t("settlementLinks.claimed", { date: new Date(link.claimedAt).toLocaleDateString("cs-CZ") })}</span>}
      {link.receivedAt && <span className="text-pine">{t("settlementLinks.received", { date: new Date(link.receivedAt).toLocaleDateString("cs-CZ") })}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR" width={160} height={160} />}
    </div>
  );
}
