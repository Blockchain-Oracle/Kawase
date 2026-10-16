"use client";

// Source: 21st.dev efferd/floating-header (https://21st.dev/@efferd/components/floating-header). Changes for Kawase:
// brand, links and the action come from props; the glass rim and fill use the `glass` tokens (DESIGN.md "Glass");
// the shadcn Sheet is replaced by an inline disclosure panel so the header has no dialog dependency; no shadow.
// The radius is a fixed 28 px, not rounded-full: closed, the ~50 px bar clamps it to a pill; open, the menu grows the
// header and rounded-full turned it into one huge capsule whose curve cut into the links (Abu, 10-16).
import React from "react";
import { MenuIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type HeaderLink = { label: string; href: string };

export function FloatingHeader({
  brand,
  links,
  action,
  extra,
}: {
  brand: React.ReactNode;
  links: readonly HeaderLink[];
  action: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <header
      className={cn(
        "sticky top-4 z-50",
        "mx-auto w-full max-w-5xl rounded-[28px] border border-glass-border",
        "bg-glass backdrop-blur-xl supports-[backdrop-filter]:bg-glass",
      )}
    >
      <nav className="mx-auto flex items-center justify-between gap-2 p-1.5 ps-3">
        <div className="flex items-center gap-2">{brand}</div>
        <div className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              href={link.href}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {extra}
          {action}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted lg:hidden"
          >
            {open ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
          </button>
        </div>
      </nav>
      {open ? (
        <div id="mobile-nav" className="grid gap-1 border-t border-glass-border p-3 lg:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              className="rounded-2xl px-3 py-2 text-sm text-foreground hover:bg-muted"
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </header>
  );
}
