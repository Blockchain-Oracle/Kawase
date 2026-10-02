"use client";

// Ink (dark) is the default; paper (light) is a full second theme from the same tokens. The choice is remembered
// per browser; the inline script in the layout applies it before the first paint.
import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  );
}
