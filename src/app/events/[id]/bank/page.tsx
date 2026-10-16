"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import BankHeader from "@/components/bank/BankHeader";
import { kc, pluralForm } from "@/components/bank/bank-format";

// Banka -> Přehled (docs/bank-reconciliation.md A9): cards with count + sum, each linking to the list
// with the matching filter.
type Sum = { income: number; expense: number; saldo: number; count: number; incomeCount: number; expenseCount: number };
type Overview = {
  accounts: { label: string; number: string; openingBalance: number | null; closingBalance: number | null }[];
  all: Sum;
  pairing: { paired: Sum; sure: Sum; possible: Sum; unpaired: Sum };
  documents: Record<string, { count: number; sum: number }>;
  missingDocuments: { count: number; sum: number };
  cash: { withdrawn: number; withdrawals: number; billsCash: number; billsCashCount: number };
  private: { personId: string | null; name: string | null; out: number; in: number; saldo: number; count: number }[];
  nodoc: Sum;
};

export default function BankOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [d, setD] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    fetch(`/api/events/${id}/bank/overview`).then(async (r) => (r.status === 403 ? setDenied(true) : r.ok && setD(await r.json()))).catch(() => {});
  }, [id]);
  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("bank.noAccess")}</div>;
  if (!d) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const tx = (q: string) => `/events/${id}/bank/transactions?${q}`;
  const bills = (q: string) => `/events/${id}/bills?${q}`;
  const n = (count: number, kind: "tx" | "bill") => `${count} ${t(`bankPlural.${kind}.${pluralForm(count)}`)}`;
  const line = (label: string, count: number, sum: number, href: string, kind: "tx" | "bill" = "tx") => (
    <a href={href} className="flex justify-between gap-3 border-b border-mist/60 py-1 text-[13px] hover:bg-paper">
      <span className="text-ink-secondary">{label}</span>
      <span className="text-ink">{n(count, kind)} · <span className="tabular-nums">{kc(sum)}</span></span>
    </a>
  );
  const card = (title: string, children: React.ReactNode) => (
    <section className="rounded-lg border border-mist bg-paper-2 p-4">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
  const docLine = (k: string) => line(t(`bankOverview.doc.${k}`), d.documents[k]?.count ?? 0, d.documents[k]?.sum ?? 0, bills(`payment=${k}`), "bill");

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <BankHeader title={t("bankNav.overview")} />
      {d.accounts.length === 0 && (
        <p className="mb-4 text-[14px] text-ink-secondary">
          {t("bankOverview.noAccounts")} <a href={`/events/${id}/bank/accounts`} className="text-ember hover:underline">{t("bankNav.accounts")}</a>
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {card(t("bankOverview.account"), (
          <>
            {d.accounts.map((a) => (
              <p key={a.number} className="mb-1 text-[13px] text-ink-secondary">
                {a.label} · {a.number}
                {a.openingBalance !== null && a.closingBalance !== null && ` · ${t("bankOverview.balances", { start: kc(a.openingBalance), end: kc(a.closingBalance) })}`}
              </p>
            ))}
            {line(t("bankTx.income"), d.all.incomeCount, d.all.income, tx("tab=all&dir=in"))}
            {line(t("bankTx.expense"), d.all.expenseCount, d.all.expense, tx("tab=all&dir=out"))}
            <p className="mt-1 text-right text-[13px] font-medium text-ink">{t("bankTx.saldo")}: {kc(d.all.saldo)}</p>
          </>
        ))}
        {card(t("bankOverview.pairing"), (
          <>
            {line(t("bankPair.paired"), d.pairing.paired.count, d.pairing.paired.expense, tx("tab=paired"))}
            {line(t("bankTier.sure"), d.pairing.sure.count, d.pairing.sure.expense, tx("tab=suggested&tier=sure"))}
            {line(t("bankTier.possible"), d.pairing.possible.count, d.pairing.possible.expense, tx("tab=suggested&tier=possible"))}
            {line(t("bankPair.unpaired"), d.pairing.unpaired.count, d.pairing.unpaired.expense, tx("tab=todo&cls=expense&pair=unpaired"))}
          </>
        ))}
        {card(t("bankOverview.documents"), (
          <>
            {docLine("bank")}
            {docLine("cash")}
            {docLine("other_account")}
            {docLine("uncovered")}
          </>
        ))}
        {card(t("bankOverview.cash"), (
          <p className="text-[13px] text-ink">
            {t("bankOverview.cashLine", { withdrawn: kc(d.cash.withdrawn), withdrawals: n(d.cash.withdrawals, "tx"), bills: kc(d.cash.billsCash), billsCount: n(d.cash.billsCashCount, "bill") })}{" "}
            <a href={tx("tab=all&cls=cash")} className="text-ember hover:underline">{t("bankNav.transactions")}</a>
          </p>
        ))}
        {card(t("bankOverview.private"), (
          d.private.length === 0 ? <p className="text-[13px] text-ink-secondary">{t("bankOverview.none")}</p> : (
            <>
              {d.private.map((p) => (
                <a key={String(p.personId)} href={tx(`tab=all&cls=private${p.personId ? `&person=${p.personId}` : ""}`)} className="flex justify-between gap-3 border-b border-mist/60 py-1 text-[13px] hover:bg-paper">
                  <span>{p.name ?? t("bankOverview.noPerson")}</span>
                  <span className="text-ink-secondary">
                    {t("bankOverview.privateLine", { out: kc(p.out), in: kc(p.in) })} ·{" "}
                    <span className={p.saldo < 0 ? "font-medium text-amber-700" : "text-ink"}>{p.saldo < 0 ? t("bankOverview.owes", { name: p.name ?? "?", amount: kc(-p.saldo) }) : t("bankOverview.settled", { amount: kc(p.saldo) })}</span>
                  </span>
                </a>
              ))}
            </>
          )
        ))}
        {card(t("bankOverview.noDoc"), (
          <>
            {line(t("bankOverview.noDocTx"), d.nodoc.count, d.nodoc.expense, tx("tab=nodoc"))}
            {line(t("bankOverview.missingDocs"), d.missingDocuments.count, d.missingDocuments.sum, bills("payment=missing"), "bill")}
          </>
        ))}
      </div>
    </div>
  );
}
