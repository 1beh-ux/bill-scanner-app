"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatCzk } from "@/lib/format";
import { MESSAGE_CASES, type Messages } from "@/lib/settlement-message";

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

/** Platby: where people pay (a summary; set in Nastavení akce -> Osobní účtenky a platby) and the links for everyone. */
export default function SettlementLinks({ eventId, people, names, t, onChanged, onMessages, messageFor }: { eventId: string; people: string[]; names: Record<string, string>; t: T; onChanged: () => void; onMessages: (m: Messages) => void; messageFor: (authorId: string, name: string, url: string) => string }) {
  const [st, setSt] = useState<State | null>(null);
  const [list, setList] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/events/${eventId}/settlement-settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => {
        setSt(d);
        if (d) onMessages(d.messages);
      })
      .catch(() => setSt(null));
  }, [eventId, onMessages]);
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
        <span className="text-ink">
          {t("settlementLinks.receiverShort", { name: st.receiver?.name ?? "—" })} · {st.receiver?.autoConfirm ? t("settlementLinks.autoShortOn") : t("settlementLinks.autoShortOff")}
        </span>
        <a href={`/events/${eventId}?tab=vyuctovani`} className={btn}>
          {t("settlementLinks.settingsButton")}
        </a>
      </div>
      {(!st.receiver || !st.receiver.hasAccount) && <p className="text-amber-700">{st.receiver ? t("settlementLinks.noAccount", { name: st.receiver.name }) : t("settlementLinks.noTreasurer")}</p>}
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

/**
 * Nastavení akce -> Osobní účtenky a platby: the Pokladník (default author of personal bills), where people pay
 * the event, the Pokladník's Fio token (automatic confirmation) and the texts sent with the links.
 */
export function SettlementSettings({ eventId, t }: { eventId: string; t: T }) {
  const [st, setSt] = useState<State | null>(null);
  const [people, setPeople] = useState<{ key: string; name: string; authorId: string | null }[]>([]);
  const [treasurerId, setTreasurerId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [texts, setTexts] = useState<Messages | null>(null);
  const [saved, setSaved] = useState(false);
  const url = `/api/events/${eventId}/settlement-settings`;
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch(url).then((r) => (r.ok ? r.json() : null)), fetch(`/api/events/${eventId}/personal-bills`).then((r) => (r.ok ? r.json() : null))]);
    setSt(a);
    if (a) setTexts(a.messages);
    if (b) {
      setPeople(b.people);
      setTreasurerId(b.treasurerAuthorId);
    }
  }, [url, eventId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  async function patch(body: Record<string, unknown>) {
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) setSt(await r.json());
  }
  async function setTreasurer(key: string) {
    await fetch(`/api/events/${eventId}/personal-bills/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ treasurer: key || null }) }).catch(() => null);
    load();
  }
  if (!st || !texts) return null;
  const treasurerKey = people.find((p) => p.authorId === treasurerId)?.key ?? "";
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <section className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("settlementLinks.treasurerTitle")}</h3>
        <label className="flex flex-wrap items-center gap-2">
          {t("personalBills.treasurer")}
          <select value={treasurerKey} onChange={(e) => setTreasurer(e.target.value)} className={inputSm}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[12px] text-ink-secondary">{t("personalBills.treasurerHint")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("settlementLinks.receiver")}</h3>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={st.receiverMode === "treasurer"} onChange={() => patch({ receiver: "treasurer" })} />
          {t("settlementLinks.receiverTreasurer", { name: st.treasurer?.name ?? "—" })}
        </label>
        <label className={"flex items-center gap-1.5 " + (st.eventAccount ? "" : "opacity-50")}>
          <input type="radio" disabled={!st.eventAccount} checked={st.receiverMode === "event"} onChange={() => patch({ receiver: "event" })} />
          {t("settlementLinks.receiverEvent", { name: st.eventAccount?.label ?? "—" })}
        </label>
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
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("settlementLinks.fioPlaceholder")} autoComplete="off" className={inputSm + " w-64 max-w-full"} />
                <button type="submit" disabled={token.trim().length < 20} className={btn}>
                  {t("common.save")}
                </button>
              </form>
            )}
          </div>
        )}
        <p className="text-[12px] text-ink-secondary">{st.receiver?.autoConfirm ? t("settlementLinks.autoOn") : t("settlementLinks.autoOff")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("settlementLinks.texts")}</h3>
        <p className="text-[12px] text-ink-secondary">{t("settlementLinks.textsHint")}</p>
        {MESSAGE_CASES.map((k) => (
          <label key={k} className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
            {t(`settlementLinks.text.${k}`)}
            <textarea value={texts[k]} onChange={(e) => { setTexts({ ...texts, [k]: e.target.value }); setSaved(false); }} rows={3} className={inputSm} />
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button type="button" onClick={async () => { await patch({ messages: texts }); setSaved(true); }} className={btn}>
            {t("common.save")}
          </button>
          {saved && <span className="text-pine">{t("driveSettings.saved")}</span>}
        </div>
      </section>
    </div>
  );
}

/** One person on Platby: their link (copy / open / QR / new) and what they marked there. */
export function LinkCell({ eventId, authorId, link, net, message, t, onChanged }: { eventId: string; authorId: string; link: { path: string; claimedAt: string | null; receivedAt: string | null; acceptedAt: string | null; acceptedAmount: number | null } | null; net: number; message: (url: string) => string; t: T; onChanged: () => void }) {
  const [copiedText, setCopiedText] = useState(false);
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

    </div>
  );
}

type HistoryItem = {
  at: string | null;
  personId: string;
  person: string;
  kind: "payout" | "paid" | "paidBack" | "direct" | "voided";
  title: string;
  amountCzk: number;
  by: string | null;
  counterpart: string | null;
  lines?: { description: string; share: number; people: number; total: number }[];
  quantity?: number | null;
  unitPrice?: number | null;
  note?: string;
  paidAt?: string | null;
};

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
    <li key={k} className={"border-b border-mist/50 py-1 text-[13px] " + (i.kind === "voided" ? "opacity-80" : "")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <span className="text-ink-secondary">{i.at ? new Date(i.at).toLocaleDateString("cs-CZ") : "—"}</span> {showPerson && <b>{i.person} </b>}
          {t(`settlementLinks.history.${i.kind}`, { name: i.counterpart ?? "", date: i.paidAt ? new Date(i.paidAt).toLocaleDateString("cs-CZ") : "" })}
          {i.title && <span className="text-ink-secondary"> · {i.title}</span>}
          <span className="text-[11.5px] text-ink-secondary"> · {i.by ?? t("settlementLinks.history.auto")}</span>
        </span>
        <span className={"shrink-0 whitespace-nowrap tabular-nums " + (i.kind === "voided" ? "text-red-700 line-through" : i.kind === "payout" || i.kind === "paidBack" ? "text-ink" : "text-pine")}>
          {i.kind === "payout" || i.kind === "paidBack" ? "− " : i.kind === "voided" ? "" : "+ "}
          {formatCzk(i.amountCzk)}
        </span>
      </div>
      {i.note && <p className="text-[12px] text-red-700">{t("settlementLinks.history.reason", { note: i.note })}</p>}
      {/* What exactly was paid: the receipt lines / pieces. */}
      {i.quantity != null && i.unitPrice != null && <p className="pl-3 text-[12px] text-ink-secondary">{i.quantity} × {formatCzk(i.unitPrice)}</p>}
      {i.lines && i.lines.length > 0 && (
        <ul className="pl-3 text-[12px] text-ink-secondary">
          {i.lines.map((l, j) => (
            <li key={j} className="flex justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {l.description || "—"}
                {l.people > 1 && ` (${formatCzk(l.total)} / ${l.people})`}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCzk(l.share)}</span>
            </li>
          ))}
        </ul>
      )}
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
