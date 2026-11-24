"use client";

import { toBoolean } from "@/lib/participant-fields";
import { calcDeps, evaluateCalc, readCalcSpec } from "@/lib/field-calc";

// One org-wide field as an input, by its type -- the parent portal and the
// public registration form. Values are plain strings ("true"/"false" for booleans).
export const portalInputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

const INPUT_TYPE: Record<string, string> = { number: "number", date: "date", email: "email", phone: "tel" };

export default function FieldInput({
  field,
  value,
  onChange,
  yesLabel,
  required,
  calc,
}: {
  field: { fieldType: string; options: unknown };
  value: string;
  onChange: (v: string) => void;
  yesLabel: string;
  required?: boolean;
  // 2026-11-24: a calculated field shown read-only, worked out live from the other answers on the screen.
  calc?: { values: Record<string, string>; eventStart?: string | null; missingLabel: string; labelOf?: (key: string) => string };
}) {
  if (field.fieldType === "calculated") {
    const spec = readCalcSpec("calculated", field.options);
    if (!spec) return null;
    const valueOf = (k: string) => calc?.values[k];
    const missing = calcDeps(spec).filter((k) => !valueOf(k)?.trim());
    const shown = evaluateCalc(spec, { valueOf, eventStart: calc?.eventStart ? new Date(calc.eventStart) : null, today: new Date() });
    return (
      <div className="rounded-lg border border-dashed border-mist bg-paper px-3 py-2.5 text-[15px] text-ink">
        {shown || "—"}
        {missing.length > 0 && <div className="mt-1 text-[12px] text-amber-700">{calc?.missingLabel}: {missing.map((k) => calc?.labelOf?.(k) ?? k).join(", ")}</div>}
      </div>
    );
  }
  if (field.fieldType === "boolean" || field.fieldType === "consent") {
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
  // Fields Manager types (phase 3c).
  if (field.fieldType === "multi") {
    const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string") : [];
    const chosen = new Set(value.split("\n").filter(Boolean));
    const toggle = (o: string) => onChange(options.filter((x) => (x === o ? !chosen.has(o) : chosen.has(x))).join("\n"));
    return (
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-[15px] text-ink">
            <input type="checkbox" checked={chosen.has(o)} onChange={() => toggle(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (field.fieldType === "longtext") return <textarea rows={4} value={value} required={required} onChange={(e) => onChange(e.target.value)} className={portalInputClass} />;
  return (
    <input
      type={INPUT_TYPE[field.fieldType] ?? "text"}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className={portalInputClass}
    />
  );
}
