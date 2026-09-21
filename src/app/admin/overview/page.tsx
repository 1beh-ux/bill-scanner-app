"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { formatCzk } from "@/lib/format";

type EventRow = {
  id: string;
  name: string;
  status: "active" | "closed";
  usersWithAccess: number;
  billsByStatus: Record<string, number>;
  budgetCzk: string;
  spentCzk: string;
  payers: number;
  drive: {
    hasFolders: boolean;
    kind: "user" | "service_account";
    email: string;
    warning: "no_connection" | "token_invalid" | "user_inactive" | null;
    configuredBy: string | null;
    configuredByActive: boolean | null;
  };
};
type GoogleRow = {
  userName: string;
  userEmail: string;
  userActive: boolean;
  googleEmail: string;
  connectedAt: string;
  valid: boolean;
  events: string[];
};

// Admin-only, read-only: every event at a glance, plus every connected Google
// account. Rows that need attention (Drive fell back to the service account, or the
// configuring user is inactive / their token is dead) are highlighted.
export default function AdminOverviewPage() {
  const { t, role, roleLoaded } = useTranslations();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [accounts, setAccounts] = useState<GoogleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEvents(d.events);
          setAccounts(d.googleAccounts);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (roleLoaded && role !== "admin") return <div className="p-8 text-[14px] text-ink-secondary">{t("common.adminOnly")}</div>;
  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const th = "p-2 text-left text-[12px] font-medium text-ink-secondary";
  const attention = (e: EventRow) => e.drive.hasFolders && (e.drive.kind === "service_account" || e.drive.configuredByActive === false);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("adminOverview.title")}</h1>
      <p className="mb-5 text-[13px] text-ink-secondary">{t("adminOverview.intro")}</p>

      <div className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-mist">
              <th className={th}>{t("adminOverview.colEvent")}</th>
              <th className={th}>{t("adminOverview.colUsers")}</th>
              <th className={th}>{t("adminOverview.colDrive")}</th>
              <th className={th}>{t("adminOverview.colBills")}</th>
              <th className={th}>{t("adminOverview.colBudget")}</th>
              <th className={th}>{t("adminOverview.colPayers")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={"border-b border-mist/60 align-top " + (attention(e) ? "bg-amber-50" : "")}>
                <td className="p-2 text-[14px]">
                  <a href={`/events/${e.id}`} className="text-ember hover:underline">
                    {e.name}
                  </a>
                  <div className="text-[12px] text-ink-secondary">{t(e.status === "active" ? "common.statusActive" : "common.statusClosed")}</div>
                </td>
                <td className="p-2 text-[14px] text-ink">{e.usersWithAccess}</td>
                <td className="p-2 text-[13px] text-ink">
                  {!e.drive.hasFolders ? (
                    <span className="text-ink-secondary">{t("adminOverview.driveNone")}</span>
                  ) : (
                    <>
                      <div>{e.drive.email || "—"}</div>
                      <div className="text-[12px] text-ink-secondary">
                        {e.drive.kind === "user"
                          ? t("adminOverview.driveUser", { name: e.drive.configuredBy ?? "" })
                          : t("adminOverview.driveServiceAccount")}
                      </div>
                      {e.drive.warning && (
                        <div className="text-[12px] font-medium text-amber-700">{t(`adminOverview.warning.${e.drive.warning}`)}</div>
                      )}
                      {e.drive.configuredByActive === false && (
                        <div className="text-[12px] font-medium text-red-600">{t("adminOverview.configuredByInactive", { name: e.drive.configuredBy ?? "" })}</div>
                      )}
                    </>
                  )}
                </td>
                <td className="p-2 text-[13px] text-ink-secondary">
                  {Object.keys(e.billsByStatus).length === 0
                    ? "—"
                    : Object.entries(e.billsByStatus)
                        .map(([status, n]) => `${t(`billsPage.status${status.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`)}: ${n}`)
                        .join(" · ")}
                </td>
                <td className="p-2 text-[13px] text-ink">
                  {formatCzk(e.spentCzk)}
                  <div className="text-[12px] text-ink-secondary">
                    {parseFloat(e.budgetCzk) > 0 ? t("adminOverview.ofBudget", { budget: formatCzk(e.budgetCzk) }) : t("adminOverview.noBudget")}
                  </div>
                </td>
                <td className="p-2 text-[14px] text-ink">{e.payers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("adminOverview.googleTitle")}</h2>
      {accounts.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("adminOverview.googleNone")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr className="border-b border-mist">
                <th className={th}>{t("adminOverview.colUser")}</th>
                <th className={th}>{t("adminOverview.colGoogle")}</th>
                <th className={th}>{t("adminOverview.colValid")}</th>
                <th className={th}>{t("adminOverview.colUsedBy")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.googleEmail} className={"border-b border-mist/60 " + (!a.valid || !a.userActive ? "bg-amber-50" : "")}>
                  <td className="p-2 text-[14px] text-ink">
                    {a.userName}
                    {!a.userActive && <span className="ml-2 text-[12px] text-red-600">{t("adminOverview.inactiveUser")}</span>}
                    <div className="text-[12px] text-ink-secondary">{a.userEmail}</div>
                  </td>
                  <td className="p-2 text-[13px] text-ink">
                    {a.googleEmail}
                    <div className="text-[12px] text-ink-secondary">{new Date(a.connectedAt).toLocaleDateString("cs-CZ")}</div>
                  </td>
                  <td className="p-2 text-[13px]">
                    <span className={a.valid ? "text-pine" : "font-medium text-red-600"}>
                      {t(a.valid ? "adminOverview.valid" : "adminOverview.expired")}
                    </span>
                  </td>
                  <td className="p-2 text-[13px] text-ink-secondary">{a.events.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
