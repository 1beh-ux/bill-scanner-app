"use client";

import { toBoolean } from "@/lib/participant-fields";

// One org-wide field as an input, by its type -- the parent portal and the
// public registration form. Values are plain strings ("true"/"false" for booleans).
export const portalInputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function FieldInput({
  field,
  value,
  onChange,
  yesLabel,
  required,
}: {
  field: { fieldType: string; options: unknown };
  value: string;
  onChange: (v: string) => void;
  yesLabel: string;
  required?: boolean;
}) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[15px] text-ink">
        <input type="checkbox" checked={toBoolean(value, field.options) === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {yesLabel}
      </label>
    );
  }
  if (field.fieldType === "select") {
    const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string") : [];
    return (
      <select value={value} required={required} onChange={(e) => onChange(e.target.value)} className={portalInputClass}>
        <option value="">—</option>
        {[...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className={portalInputClass}
    />
  );
}
