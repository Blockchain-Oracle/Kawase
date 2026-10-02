// Source: 21st.dev kokonutd/bento-grid (https://21st.dev/@kokonutd/components/bento-grid). Changes for Kawase:
// colours from the tokens (ink cards, hairline borders, no shadow); the hover dot pattern uses the `texture` token,
// Kawase's stipple material; the status slot takes a rendered node (the registry state) instead of a fixed string;
// the icon slot takes real marks; tags became partner names (plain text where no mark exists). The sample items are
// gone: every item comes from the caller.
import type React from "react";

import { cn } from "@/lib/utils";

export interface BentoItem {
  key: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  status: React.ReactNode;
  tags?: string[];
  footnote?: React.ReactNode;
  colSpan?: 1 | 2;
  muted?: boolean;
}

export function BentoGrid({ items }: { items: readonly BentoItem[] }) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn(
            "group relative overflow-hidden rounded-3xl border border-border bg-card p-5 transition-transform duration-300",
            "will-change-transform hover:-translate-y-0.5",
            item.colSpan === 2 ? "md:col-span-2" : "col-span-1",
          )}
        >
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--texture)_1px,transparent_1px)] bg-[length:6px_6px]" />
          </div>

          <div className="relative flex h-full flex-col gap-3">
            <div className="flex min-h-8 items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">{item.icon}</div>
              {item.status}
            </div>

            <div className="space-y-1.5">
              <h3 className={cn("font-display text-lg font-semibold tracking-tight", item.muted && "text-foreground/80")}>
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>

            {item.footnote ? <div className="text-xs leading-relaxed text-foreground/80">{item.footnote}</div> : null}

            {item.tags && item.tags.length > 0 ? (
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2.5 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
