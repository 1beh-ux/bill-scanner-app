"use client";

import { useCallback } from "react";
import TicketScanner from "@/components/tickets/TicketScanner";

export default function ScanApp({ token, strings, counts }: { token: string; strings: Record<string, string>; counts: { paid: number; used: number } }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = strings[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
      return s;
    },
    [strings]
  );
  return <TicketScanner api={`/api/public/scan/${token}`} t={t} initialCounts={counts} />;
}
