"use client";

import { useEffect, useState } from "react";

/** Folded section ids, remembered per browser under `key` (a convenience -- nothing breaks without storage). */
export function useCollapsed(key: string): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(stored)) setCollapsed(new Set(stored.filter((x) => typeof x === "string")));
    } catch {}
  }, [key]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  return [collapsed, toggle];
}
