"use client";

// Content rises into place the first time it scrolls into view (once; still with reduced motion).
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { EASE_OUT } from "@/lib/landing.config";

const RISE_PX = 28;
const DURATION_S = 0.7;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: RISE_PX }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: DURATION_S, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
