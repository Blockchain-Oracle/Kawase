"use client";

// Content rises into place the first time it scrolls into view (once). With reduced motion it is simply there, from
// the first paint: CSS holds it at rest (STILL_WITH_REDUCED_MOTION), so server and client render the same element.
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { EASE_OUT, STILL_WITH_REDUCED_MOTION } from "@/lib/landing.config";
import { cn } from "@/lib/utils";

const RISE_PX = 28;
const DURATION_S = 0.7;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={cn(STILL_WITH_REDUCED_MOTION, className)}
      initial={{ opacity: 0, y: RISE_PX }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: DURATION_S, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
