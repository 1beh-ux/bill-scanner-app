"use client";

import type { ImportField } from "@/lib/planning-import";

// Table import column mapping (bill table import, Banka import): one row per source column with a
// sample of its values and the target field. The caller owns the mapping (one field per column).
type T = (key: string, vars?: Record<string, string>) => string;
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function ColumnMappingTable({
  headers,
  rows,
  mapping,
  fields,
  label,
  onChange,
  t,
}: {
  headers: string[];
  rows: string[][];
  mapping: string[];
  fields: ImportField[];
  // The option text of a field (with any markers like " *").
  label: (f: ImportField) => string;
  onChange: (column: number, key: string) => void;
  t: T;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-mist">
      <table className="w-full text-[13px]">
        <tbody>
          {headers.map((h, i) => (
            <tr key={i} className="border-b border-mist/60 last:border-0">
              <td className="p-2 font-medium text-ink">{h || `#${i + 1}`}</td>
              <td className="max-w-[260px] truncate p-2 text-ink-secondary">{rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ")}</td>
              <td className="w-[220px] p-2">
                <select value={mapping[i] ?? ""} onChange={(e) => onChange(i, e.target.value)} className={inputClass}>
                  <option value="">{t("planImport.ignoreColumn")}</option>
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {label(f)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
