"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import ColumnPicker from "@/components/ColumnPicker";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";

// The participant export's columns (src/lib/export-columns.ts): with eventId this event's own (reset = the
// organization's); without, the organization's default (Šablony -> Účastníci, its fields + the fixed ones).
type Option = { key: string; label: string };

export default function ExportColumns({ eventId }: { eventId?: string }) {
  const { t } = useTranslations();
  const [options, setOptions] = useState<Option[]>([]);
  const [shown, setShown] = useState<string[] | null>(null);
  const url = eventId ? `/api/events/${eventId}/export-columns` : "/api/organizations/export-columns";

  const load = useCallback(async () => {
    const [fields, saved] = await Promise.all([
      fetch(eventId ? `/api/events/${eventId}/participant-fields` : "/api/participant-field-templates").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<{ own?: string[] | null; org?: string[] | null; keys?: string[] | null }>,
    ]);
    // The organization has only its own fields as templates; the fixed ones (name, birth date, price...) every event has.
    const all = [...(eventId ? [] : FIXED_PARTICIPANT_FIELDS), ...(fields as { key: string; label: string; fieldType?: string; active?: boolean }[])];
    const opts: Option[] = all.filter((f) => f.fieldType !== "image" && ("active" in f ? f.active !== false : true)).map((f) => ({ key: f.key, label: f.label }));
    setOptions(opts);
    const keys: string[] | null = eventId ? (saved.own ?? saved.org ?? null) : (saved.keys ?? null);
    setShown(keys ? keys.filter((k) => opts.some((o) => o.key === k)) : opts.map((o) => o.key));
  }, [eventId, url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);

  if (!shown || options.length === 0) return null;
  const put = (keys: string[] | null) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys }) }).then(load);
  return (
    <ColumnPicker
      options={options}
      shown={shown}
      labels={{
        button: t("exportColumns.button"),
        title: t(eventId ? "exportColumns.titleEvent" : "exportColumns.titleOrg"),
        dragHint: t("participantsPage.columnsDragHint"),
        notShown: t("participantsPage.columnsNotShown"),
        reset: t(eventId ? "exportColumns.resetEvent" : "exportColumns.resetOrg"),
      }}
      onSave={(keys) => put(keys)}
      onReset={() => put(null)}
    />
  );
}
