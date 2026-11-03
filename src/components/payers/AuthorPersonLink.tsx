"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

// Plátci -> "Dospělý a kontakt" (travel orders A3): Propojit s dospělým -- a soft link of this payer to an adult in
// Lidé (never a merge; same-name adults offered first, never linked automatically), and the payer's own phone /
// address for travel orders when they aren't linked.
type Adult = { id: string; name: string; isAdult: boolean };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const input = "rounded-lg border border-mist bg-paper px-2.5 py-1.5 text-[13px] text-ink";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function AuthorPersonLink({ author, onChanged }: { author: { id: string; canonicalName: string; childId: string | null; phone: string | null; address: string | null; child?: { id: string; name: string } | null }; onChanged: () => void }) {
  const { t } = useTranslations();
  const [adults, setAdults] = useState<Adult[]>([]);
  const [pick, setPick] = useState("");
  const [phone, setPhone] = useState(author.phone ?? "");
  const [address, setAddress] = useState(author.address ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/children?list=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Adult[]) => {
        const same = (a: Adult) => norm(a.name) === norm(author.canonicalName);
        setAdults(list.filter((a) => a.isAdult).sort((a, b) => Number(same(b)) - Number(same(a)) || a.name.localeCompare(b.name, "cs")));
      })
      .catch(() => setAdults([]));
  }, [author.canonicalName]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/authors/${author.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMsg(res?.ok ? "✓" : t("payerLink.error"));
    if (res?.ok) {
      const a = await res.json();
      setPhone(a.phone ?? "");
      onChanged();
    }
  }
  const sameName = adults.filter((a) => norm(a.name) === norm(author.canonicalName));

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div>
        <div className="mb-1 font-medium text-ink">{t("payerLink.title")}</div>
        {author.child ? (
          <div className="flex flex-wrap items-center gap-2 text-ink">
            {t("payerLink.linked", { name: author.child.name })}
            <a href={`/children/${author.child.id}`} className="text-ember hover:underline">
              {t("payerLink.open")}
            </a>
            <button type="button" className="text-ink-secondary hover:underline" onClick={() => patch({ childId: null })}>
              {t("payerLink.unlink")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {sameName.length > 0 && <span className="text-amber-800">{t("payerLink.sameName", { name: sameName[0].name })}</span>}
            <select className={input} value={pick || sameName[0]?.id || ""} onChange={(e) => setPick(e.target.value)} aria-label={t("payerLink.title")}>
              <option value="">—</option>
              {adults.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="button" className={btnPrimary} disabled={!(pick || sameName[0]?.id)} onClick={() => patch({ childId: pick || sameName[0]?.id })}>
              {t("payerLink.link")}
            </button>
          </div>
        )}
        <p className="mt-1 text-[12px] text-ink-secondary">{t("payerLink.hint")}</p>
      </div>
      <div>
        <div className="mb-1 font-medium text-ink">{t("payerLink.contactTitle")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("payerLink.phone")} aria-label={t("payerLink.phone")} />
          <input className={input + " min-w-[18rem]"} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("payerLink.address")} aria-label={t("payerLink.address")} />
          <button type="button" className={btnPrimary} onClick={() => patch({ phone, address })}>
            {t("common.save")}
          </button>
          {msg && <span className="text-ink-secondary">{msg}</span>}
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">{t("payerLink.contactHint")}</p>
      </div>
    </div>
  );
}
