"use client";

import { useEffect, useRef, useState } from "react";

// Our own date / time inputs (2026-11-03): always Czech "23. 10. 2026" and 24 h "14:30", whatever the browser's
// locale (the native pickers follow it -- AM/PM, month first). Typing works ("23.10.", "1430", "14"); a calendar
// (Monday first) or a list of times every 15 minutes opens below. The popup is position: fixed, so it isn't cut
// off inside a scrolling table.
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

export const showDate = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? `${Number(v.slice(8, 10))}. ${Number(v.slice(5, 7))}. ${v.slice(0, 4)}` : "");

/** "23.10.2026", "23. 10.", "23/10/26", "2026-10-23" -> "2026-10-23"; "" -> ""; null = not a date. */
export function parseDate(text: string, baseYear: number): string | null {
  const s = text.trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  m = s.match(/^(\d{1,2})\s*[.\/\s-]\s*(\d{1,2})\s*[.\/\s-]?\s*(\d{2}|\d{4})?\.?$/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : baseYear;
  return valid(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : null;
}

/** "14:30", "1430", "14.30", "14", "9:5" -> "14:30" / "09:05"; "" -> ""; null = not a time. */
export function parseTime(text: string): string | null {
  const s = text.trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})(?:\s*[:.,h\s]\s*(\d{1,2}))?$/) ?? s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = +m[1];
  const min = m[2] === undefined ? 0 : +m[2];
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

function usePopup() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 260), top: r.bottom + 4 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return { open, setOpen, pos, ref, show };
}

const popupClass = "fixed z-50 rounded-lg border border-mist bg-paper p-2 text-[13px] text-ink shadow-lg";

export function DateField({ value, onChange, disabled, className = "", ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const { open: popOpen, setOpen: setPopOpen, pos: popPos, ref: inputRef, show: showPop } = usePopup();
  const today = new Date().toISOString().slice(0, 10);
  const base = value || today;
  const [view, setView] = useState({ y: +base.slice(0, 4), m: +base.slice(5, 7) });
  const commit = () => {
    if (text === null) return;
    const v = parseDate(text, +(value || today).slice(0, 4));
    setBad(v === null);
    if (v !== null) {
      onChange(v);
      setText(null);
    }
  };
  const first = (new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const step = (d: number) => setView(({ y, m }) => (m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d }));
  return (
    <>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode="numeric"
        placeholder="d. m. rrrr"
        className={className + (bad ? " ring-1 ring-red-500" : "")}
        value={text ?? showDate(value)}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          setView({ y: +(value || today).slice(0, 4), m: +(value || today).slice(5, 7) });
          showPop();
        }}
        onBlur={() => {
          commit();
          setPopOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setPopOpen(false);
          }
          if (e.key === "Escape") setPopOpen(false);
        }}
      />
      {popOpen && popPos && (
        <div className={popupClass + " w-[15.5rem]"} style={popPos} onMouseDown={(e) => e.preventDefault()}>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded px-2 hover:bg-paper-2" onClick={() => step(-1)} aria-label="předchozí měsíc">
              ‹
            </button>
            <span className="font-medium">
              {MONTHS[view.m - 1]} {view.y}
            </span>
            <button type="button" className="rounded px-2 hover:bg-paper-2" onClick={() => step(1)} aria-label="další měsíc">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {DAYS.map((d) => (
              <span key={d} className="text-[11px] text-ink-secondary">
                {d}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const v = iso(view.y, view.m, i + 1);
              return (
                <button
                  key={v}
                  type="button"
                  className={"rounded py-0.5 hover:bg-paper-2 " + (v === value ? "bg-ember text-white hover:bg-ember" : v === today ? "font-semibold text-ember" : "")}
                  onClick={() => {
                    onChange(v);
                    setText(null);
                    setBad(false);
                    setPopOpen(false);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export function TimeField({ value, onChange, disabled, className = "", ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const { open: popOpen, setOpen: setPopOpen, pos: popPos, ref: inputRef, show: showPop } = usePopup();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popOpen || !list.current) return;
    const near = TIMES.findIndex((x) => x >= (value || "08:00"));
    list.current.scrollTop = Math.max(0, (near < 0 ? 95 : near) * 26 - 52);
  }, [popOpen, value]);
  const commit = () => {
    if (text === null) return;
    const v = parseTime(text);
    setBad(v === null);
    if (v !== null) {
      onChange(v);
      setText(null);
    }
  };
  return (
    <>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode="numeric"
        placeholder="hh:mm"
        className={className + (bad ? " ring-1 ring-red-500" : "")}
        value={text ?? value}
        onChange={(e) => setText(e.target.value)}
        onFocus={showPop}
        onBlur={() => {
          commit();
          setPopOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setPopOpen(false);
          }
          if (e.key === "Escape") setPopOpen(false);
        }}
      />
      {popOpen && popPos && (
        <div ref={list} className={popupClass + " max-h-56 w-24 overflow-y-auto !p-1"} style={popPos} onMouseDown={(e) => e.preventDefault()}>
          {TIMES.map((x) => (
            <button
              key={x}
              type="button"
              className={"block h-[26px] w-full rounded px-2 text-left tabular-nums hover:bg-paper-2 " + (x === value ? "bg-ember text-white hover:bg-ember" : "")}
              onClick={() => {
                onChange(x);
                setText(null);
                setBad(false);
                setPopOpen(false);
              }}
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** "YYYY-MM-DDTHH:MM": a date and a time side by side (the time defaults to 00:00 once a date is set). */
export function DateTimeField({ value, onChange, disabled, className = "", ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; ariaLabel?: string }) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div className="flex gap-1">
      <DateField value={date} disabled={disabled} className={className + " min-w-0 flex-[3]"} ariaLabel={ariaLabel} onChange={(d) => onChange(d ? `${d}T${time || "00:00"}` : "")} />
      <TimeField value={time} disabled={disabled} className={className + " min-w-0 flex-[2]"} ariaLabel={ariaLabel && `${ariaLabel} (čas)`} onChange={(t) => onChange(date ? `${date}T${t || "00:00"}` : "")} />
    </div>
  );
}
