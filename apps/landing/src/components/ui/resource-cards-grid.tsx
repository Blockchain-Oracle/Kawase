"use client";

// Source: 21st.dev kavikatiyar/cards-grid (https://21st.dev/@kavikatiyar/components/cards-grid). Changes for Kawase:
// the icon is a rendered node (a real mark) instead of an image URL; the "last updated" line became a one-line
// subtitle; internal links open in the same tab; framer-motion → motion/react with reduced motion respected; card
// colours from the tokens, no shadow (DESIGN.md: depth from the card colour and hairlines).
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ResourceCardItem {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string | null;
  /** Shown instead of the arrow when there is no link yet (e.g. "Invite only"). */
  unavailableLabel?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

const isExternal = (href: string) => /^https?:\/\//.test(href);

export const ResourceCardsGrid = ({ items, className }: { items: readonly ResourceCardItem[]; className?: string }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={containerVariants}
      initial={reduced ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true }}
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {items.map((item) => {
        const body = (
          <div className="flex h-full flex-col justify-between rounded-3xl border border-border bg-card p-5 transition-colors duration-150 group-hover:border-foreground/20">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center">{item.icon}</span>
                <div>
                  <h3 className="font-display text-base font-semibold text-card-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                </div>
              </div>
              {item.href ? (
                <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 rtl:-scale-x-100" />
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {item.unavailableLabel}
                </span>
              )}
            </div>
          </div>
        );
        return item.href ? (
          <motion.a
            key={item.title}
            href={item.href}
            variants={itemVariants}
            whileHover={reduced ? undefined : { scale: 1.02 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            className="group block rounded-3xl focus-visible:outline-2 focus-visible:outline-ring"
            {...(isExternal(item.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {body}
          </motion.a>
        ) : (
          <motion.div key={item.title} variants={itemVariants} className="group block">
            {body}
          </motion.div>
        );
      })}
    </motion.div>
  );
};
