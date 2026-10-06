"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Light / dark switch for the parent portal and the public registration page
// (top right, like the app's sidebar toggle). Same storage as the app: the
// "dark" class on <html> + localStorage "theme", which the root layout's init
// script applies before first paint. No account to save it to here.
export default function ThemeToggle({ label }: { label: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the class the init script set
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="fixed right-3 top-3 z-40 rounded-full border border-mist bg-paper p-2 text-ink-secondary shadow-sm hover:text-ink"
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
