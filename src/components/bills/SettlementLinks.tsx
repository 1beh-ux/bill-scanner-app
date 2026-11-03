"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatCzk } from "@/lib/format";
import type { MessageCase, Messages } from "@/lib/settlement-message";

// Vyúčtování on Platby (src/lib/settlement-links.ts): where people pay the event (the Pokladník's own account
// with their Fio token, or the event's Banka account), the links for everyone, and per person the link + what
// they marked there.
type T = (key: string, vars?: Record<string, string>) => string;
type State = {
  receiverMode: "treasurer" | "event";
  receiver: { kind: string; name: string; hasAccount: boolean; autoConfirm: boolean } | null;
  eventAccount: { label: string } | null;
  treasurer: { name: string; hasAccount: boolean; fioToken: boolean; fioLastSuccessAt: string | null; fioLastError: string | null } | null;
  messages: Messages;
};
const inputSm = "rounded-lg border border-mist bg-paper px-2 py-1.5 text-[13px] text-ink";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const full = (path: string) => `${window.location.origin}${path}`;

export default function SettlementLinks({ eventId, people, names, t, onChanged, onMessages, messageFor }: { eventId: string; people: string[]; names: Record<string, string>; t: T; onChanged: () => void; onMessages: (m: Messages) => void; messageFor: (authorId: string, name: string, url: string) => string }) {
  const [st, setSt] = useState<State | null>(null);
  const [token, setToken] = useState("");
  const [list, setList] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/events/${eventId}/settlement-settings`;
  const [editTexts, setEditTexts] = useState<Messages | null>(null);
  const load = useCallback(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => {
        setSt(d);
        if (d) onMessages(d.messages);
      })
      .catch(() => setSt(null));
  }, [url, onMessages]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  async function patch(body: Record<string, unknown>) {
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) {
      const d = (await r.json()) as State;
      setSt(d);
      onMessages(d.messages);
    }
  }
  async function allLinks() {
    setBusy(true);
    const r = await fetch(`/api/events/${eventId}/settlement-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorIds: people }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return;
    const out = (await r.json()) as { authorId: string; path: string }[];
    // Each person's text with their link, ready to paste one by one.
    setList(out.map((l) => `— ${names[l.authorId] ?? ""} —\n${messageFor(l.authorId, names[l.authorId] ?? "", full(l.path))}`).join("\n\n"));
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
      <button type="button" onClick={() => setEditTexts(editTexts ? null : st.messages)} className="self-start text-[12.5px] text-ember hover:underline">
        {t("settlementLinks.texts")}
      </button>
      {editTexts && (
        <div className="flex flex-col gap-2 rounded-md bg-paper-2 p-2">
          <p className="text-[12px] text-ink-secondary">{t("settlementLinks.textsHint")}</p>
          {(["owes", "owed", "both"] as MessageCase[]).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
              {t(`settlementLinks.text.${k}`)}
              <textarea value={editTexts[k]} onChange={(e) => setEditTexts({ ...editTexts, [k]: e.target.value })} rows={3} className={inputSm} />
            </label>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={async () => { await patch({ messages: editTexts }); setEditTexts(null); }} className={btn}>
              {t("common.save")}
            </button>
            <button type="button" onClick={() => setEditTexts(null)} className="text-[12.5px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
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
export function LinkCell({ eventId, authorId, link, net, message, t, onChanged }: { eventId: string; authorId: string; link: { path: string; claimedAt: string | null; receivedAt: string | null; acceptedAt: string | null; acceptedAmount: number | null } | null; net: number; message: (url: string) => string; t: T; onChanged: () => void }) {
  const [copiedText, setCopiedText] = useState(false);
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
        <button type="button" onClick={() => { navigator.clipboard?.writeText(message(full(link.path))); setCopiedText(true); }} className="text-ember hover:underline">
          {copiedText ? `✓ ${t("settlementLinks.copied")}` : t("settlementLinks.copyWithText")}
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
      {link.acceptedAt &&
        (link.acceptedAmount != null && Math.abs(link.acceptedAmount - net) < 0.005 ? (
          <span className="text-pine">{t("settlementLinks.accepted", { date: new Date(link.acceptedAt).toLocaleDateString("cs-CZ"), amount: formatCzk(link.acceptedAmount) })}</span>
        ) : (
          <span className="text-amber-700">{t("settlementLinks.acceptedChanged", { amount: formatCzk(link.acceptedAmount ?? 0) })}</span>
        ))}
      {link.receivedAt && <span className="text-pine">{t("settlementLinks.received", { date: new Date(link.receivedAt).toLocaleDateString("cs-CZ") })}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR" width={160} height={160} />}
    </div>
  );
}

type HistoryItem = { at: string | null; personId: string; person: string; kind: "payout" | "paid" | "paidBack" | "direct"; title: string; amountCzk: number; by: string | null; counterpart: string | null };

/** "Historie plateb": what has already been paid out / paid / settled, newest first, by person or by date. */
export function PaymentHistory({ eventId, t }: { eventId: string; t: T }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [byPerson, setByPerson] = useState(true);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/events/${eventId}/payment-history`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => setItems([]));
  }, [open, eventId]);
  const line = (i: HistoryItem, k: number, showPerson: boolean) => (
    <li key={k} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-mist/50 py-1 text-[13px]">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="text-ink-secondary">{i.at ? new Date(i.at).toLocaleDateString("cs-CZ") : "—"}</span> {showPerson && <b>{i.person} </b>}
        {t(`settlementLinks.history.${i.kind}`, { name: i.counterpart ?? "" })}
        {i.title && <span className="text-ink-secondary"> · {i.title}</span>}
        <span className="text-[11.5px] text-ink-secondary"> · {i.by ?? t("settlementLinks.history.auto")}</span>
      </span>
      <span className={"shrink-0 whitespace-nowrap tabular-nums " + (i.kind === "payout" || i.kind === "paidBack" ? "text-ink" : "text-pine")}>
        {i.kind === "payout" || i.kind === "paidBack" ? "− " : "+ "}
        {formatCzk(i.amountCzk)}
      </span>
    </li>
  );
  const groups = new Map<string, HistoryItem[]>();
  for (const i of items ?? []) groups.set(i.personId, [...(groups.get(i.personId) ?? []), i]);
  return (
    <section className="mt-8">
      <button type="button" onClick={() => setOpen(!open)} className="text-[16px] font-semibold text-ink hover:text-ember">
        {open ? "▾" : "▸"} {t("settlementLinks.history.title")}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-secondary">{t("settlementLinks.history.hint")}</p>
          <div className="flex gap-2 text-[12.5px]">
            {[true, false].map((v) => (
              <button key={String(v)} type="button" onClick={() => setByPerson(v)} className={"rounded-full px-3 py-1 " + (byPerson === v ? "bg-ember text-white" : "bg-paper-2 text-ink")}>
                {t(v ? "settlementLinks.history.byPerson" : "settlementLinks.history.byDate")}
              </button>
            ))}
          </div>
          {!items ? (
            <p className="text-[13px] text-ink-secondary">…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-ink-secondary">{t("settlementLinks.history.empty")}</p>
          ) : byPerson ? (
            [...groups].map(([pid, list]) => (
              <div key={pid} className="rounded-lg border border-mist p-2">
                <div className="mb-1 flex justify-between text-[14px] font-medium">
                  <span>{list[0].person}</span>
                  <span className="text-[12.5px] font-normal text-ink-secondary">
                    {t("settlementLinks.history.totals", {
                      out: formatCzk(list.filter((i) => i.kind === "payout" || i.kind === "paidBack").reduce((s, i) => s + i.amountCzk, 0)),
                      in: formatCzk(list.filter((i) => i.kind === "paid" || i.kind === "direct").reduce((s, i) => s + i.amountCzk, 0)),
                    })}
                  </span>
                </div>
                <ul>{list.map((i, k) => line(i, k, false))}</ul>
              </div>
            ))
          ) : (
            <ul>{items.map((i, k) => line(i, k, true))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
