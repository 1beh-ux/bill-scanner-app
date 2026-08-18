"use client";

import { useTranslations } from "@/lib/i18n";

export type EmailLogRow = {
  id: string;
  participantId: string;
  sentAt: string;
  status: "sent" | "failed";
  errorMessage: string | null;
  guardian: { email: string; name: string | null };
  participant?: { name: string };
};

interface ParentEmailLogTableProps {
  logs: EmailLogRow[];
  showParticipant?: boolean;
  onResend?: (log: EmailLogRow) => void;
  resendingId?: string | null;
}

export default function ParentEmailLogTable({ logs, showParticipant, onResend, resendingId }: ParentEmailLogTableProps) {
  const { t } = useTranslations();

  if (logs.length === 0) {
    return <p className="text-[13px] text-ink-secondary">{t("sendLog.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="border-b border-mist text-left">
            {showParticipant && (
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
            )}
            <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("sendLog.colGuardian")}</th>
            <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("sendLog.colSentAt")}</th>
            <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("sendLog.colStatus")}</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-mist/60">
              {showParticipant && (
                <td className="p-2 text-[14px] text-ink">{log.participant?.name ?? "—"}</td>
              )}
              <td className="p-2 text-[14px] text-ink">{log.guardian.name || log.guardian.email}</td>
              <td className="p-2 text-[13px] text-ink-secondary">
                {new Date(log.sentAt).toLocaleString("cs-CZ")}
              </td>
              <td className="p-2">
                <span
                  className={
                    "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] " +
                    (log.status === "sent" ? "bg-pine-bg text-pine" : "bg-red-50 text-red-600")
                  }
                  title={log.errorMessage ?? undefined}
                >
                  {log.status === "sent" ? t("sendLog.statusSent") : t("sendLog.statusFailed")}
                </span>
              </td>
              <td className="whitespace-nowrap p-2 text-right">
                {log.status === "failed" && onResend && (
                  <button
                    onClick={() => onResend(log)}
                    disabled={resendingId === log.id}
                    className="text-[13px] text-ember hover:underline disabled:opacity-50"
                  >
                    {resendingId === log.id ? t("common.loading") : t("sendLog.resendButton")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
