// Kawase glue, composed from installed parts: the card that rises from the bottom when a payment needs the
// user's approval (DESIGN.md, Koe). It shows exactly what will be sent and to whom, and never dismisses itself.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@kawase/ui-web/lib/utils";

export interface ConfirmRow {
  label: string;
  value: string;
  /** Shown in mono next to the value, for example a shortened address. */
  detail?: string;
  /** The amount row: large mono figures. */
  emphasis?: boolean;
}

export interface ConfirmSheetProps {
  rows: ConfirmRow[];
  /** The action area: a Button (for example "Confirm with Face ID") or HoldToConfirm, and a cancel button. */
  children: React.ReactNode;
  className?: string;
}

export function ConfirmSheet({ rows, children, className }: ConfirmSheetProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("rounded-t-[28px] border-t border-border bg-card px-5 pb-7 pt-3 text-card-foreground", className)}
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
      <dl className="space-y-1 pb-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            {row.emphasis ? (
              <dd dir="ltr" className="font-mono text-2xl font-semibold tabular-nums">{row.value}</dd>
            ) : (
              <dd className="text-end text-sm">
                {row.value}
                {row.detail ? (
                  <>
                    {" · "}
                    <span dir="ltr" className="font-mono tabular-nums">{row.detail}</span>
                  </>
                ) : null}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">{children}</div>
    </motion.div>
  );
}
