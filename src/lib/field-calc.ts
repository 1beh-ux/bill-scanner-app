// Calculated fields (Fields Manager phase 1, docs/fields-manager-design/design.md §5). New fields use
// fieldType "calculated" with options = CalcSpec; old "composite" fields are read as join / template and evaluate
// exactly as composeValue() does today. Never stored per person, never an import target. Pure.
import { composeValue, readComposite } from "@/lib/participant-fields";

export const SEPARATOR_PRESETS = [" ", ", ", "; ", "/", " / ", " - ", " | ", "", "\n"] as const;

export type BuiltinCalc = "full_name" | "contact_email" | "price" | "variable_symbol" | "payment_qr" | "membership_status" | "price_category" | "details_status";

export type CalcSpec =
  | { kind: "join"; parts: string[]; separator: string }
  | { kind: "template"; text: string }
  | { kind: "age"; source: string; asOf: "event_start" | "today" | { date: string } }
  | { kind: "if"; source: string; test: "filled" | "yes" | { equals: string }; then: string; else: string }
  | { kind: "builtin"; id: BuiltinCalc };

const BUILTINS: BuiltinCalc[] = ["full_name", "contact_email", "price", "variable_symbol", "payment_qr", "membership_status", "price_category", "details_status"];
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const keyList = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);

/** The spec of a field, or null when it isn't calculated. Untrusted options are normalised. */
export function readCalcSpec(fieldType: string, options: unknown): CalcSpec | null {
  if (fieldType === "composite") {
    const c = readComposite(options);
    return c.template ? { kind: "template", text: c.template } : { kind: "join", parts: c.parts, separator: c.separator };
  }
  if (fieldType !== "calculated") return null;
  const o = (options && typeof options === "object" && !Array.isArray(options) ? options : {}) as Record<string, unknown>;
  switch (o.kind) {
    case "join":
      return { kind: "join", parts: keyList(o.parts), separator: str(o.separator, " ").slice(0, 20) };
    case "template":
      return { kind: "template", text: str(o.text).slice(0, 2000) };
    case "age": {
      const a = o.asOf;
      const asOf = a === "today" ? "today" : a && typeof a === "object" && typeof (a as { date?: unknown }).date === "string" ? { date: (a as { date: string }).date } : "event_start";
      return { kind: "age", source: str(o.source), asOf };
    }
    case "if": {
      const t = o.test;
      const test = t === "yes" ? "yes" : t && typeof t === "object" && typeof (t as { equals?: unknown }).equals === "string" ? { equals: (t as { equals: string }).equals } : "filled";
      return { kind: "if", source: str(o.source), test, then: str(o.then), else: str(o.else) };
    }
    case "builtin":
      return BUILTINS.includes(o.id as BuiltinCalc) ? { kind: "builtin", id: o.id as BuiltinCalc } : null;
    default:
      return null;
  }
}

/** Keys a spec reads (drawn as dependencies; resolved through the same resolver). */
export function calcDeps(spec: CalcSpec): string[] {
  switch (spec.kind) {
    case "join":
      return [...spec.parts];
    case "template":
      return [...new Set([...spec.text.matchAll(/\{\{[#^/]?([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]))];
    case "age":
    case "if":
      return spec.source ? [spec.source] : [];
    case "builtin":
      return [];
  }
}

/** dd.mm.yyyy, d. m. yyyy, d.m.yyyy or yyyy-mm-dd -> UTC date; else null. */
export function parseLooseDate(s: string): Date | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = t.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Completed years between two UTC dates. */
export function ageAt(born: Date, at: Date): number {
  let n = at.getUTCFullYear() - born.getUTCFullYear();
  if (at.getUTCMonth() < born.getUTCMonth() || (at.getUTCMonth() === born.getUTCMonth() && at.getUTCDate() < born.getUTCDate())) n--;
  return n;
}

const YES = ["ano", "a", "yes", "y", "true", "1", "x"];

export type CalcContext = {
  /** Value of any key (field, guardian, event variable, alias, other calculated) -- the resolver supplies it. */
  valueOf: (key: string) => string | undefined;
  eventStart?: Date | null;
  today?: Date;
  /** Built-in values (full name, price, ...) are computed by today's code; the resolver passes them in. */
  builtin?: (id: BuiltinCalc) => string;
};

/** The value of a calculated field. Empty string when it can't be computed -- never throws. */
export function evaluateCalc(spec: CalcSpec, ctx: CalcContext): string {
  switch (spec.kind) {
    case "join":
      return composeValue({ parts: spec.parts, separator: spec.separator }, ctx.valueOf);
    case "template":
      return composeValue({ parts: [], separator: " ", template: spec.text }, ctx.valueOf);
    case "age": {
      const born = parseLooseDate(ctx.valueOf(spec.source) ?? "");
      const at = spec.asOf === "today" ? (ctx.today ?? new Date()) : spec.asOf === "event_start" ? (ctx.eventStart ?? null) : parseLooseDate(spec.asOf.date);
      if (!born || !at) return "";
      const n = ageAt(born, at);
      return n >= 0 ? String(n) : "";
    }
    case "if": {
      const v = (ctx.valueOf(spec.source) ?? "").trim();
      const hit = spec.test === "filled" ? v !== "" : spec.test === "yes" ? YES.includes(v.toLowerCase()) : v.toLowerCase() === spec.test.equals.trim().toLowerCase();
      return hit ? spec.then : spec.else;
    }
    case "builtin":
      return ctx.builtin?.(spec.id) ?? "";
  }
}
