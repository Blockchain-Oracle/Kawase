"use client";

import { XIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { EASE_OUT } from "@/lib/landing.config";

const KEY = "kawase.corner-qr.closed";
/** Shown once the page has scrolled this many window heights (past the hero). */
const SHOW_AFTER = 0.8;
/** Hidden again once the closing section (with its own QR) is this far up the window. */
const HIDE_AT = 0.9;

function closedBefore(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function CornerCard({ svg }: { svg: string }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // It waits until the hero has scrolled away (it would sit on the hero's phone).
  useEffect(() => {
    if (closedBefore()) return;
    // Out of the way where the page already offers its own QR (the closing section and below).
    const check = () => {
      const get = document.getElementById("get")?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      setOpen(window.scrollY > window.innerHeight * SHOW_AFTER && get > window.innerHeight * HIDE_AT);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  if (!open || dismissed) return null;
  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Private mode: closed for this page view only.
    }
  };

  return (
    <motion.aside
      aria-label="Get Kawase on your phone"
      className="lp-chip fixed end-5 bottom-5 z-40 hidden w-[232px] items-center gap-3 rounded-[22px] p-3 pe-4 shadow-[var(--lp-shadow)] lg:flex"
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="lp-qr w-[84px] shrink-0 rounded-[12px] bg-white p-1.5" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0">
        <p className="text-[14px] leading-tight font-semibold text-foreground">Get Kawase on your phone</p>
        <a href="/download" className="mt-1 block text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
          iPhone and Android
        </a>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute end-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </motion.aside>
  );
}
