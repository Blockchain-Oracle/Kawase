"use client";

// Source: 21st.dev barvian/number-flow (id 1444), the `@number-flow/react` component. Kawase's use: every live figure on
// the web (balance hero, prices, run totals) rolls its changed digits instead of swapping the text, the web twin of the
// phone's Skia odometer. NumberFlow respects `prefers-reduced-motion` itself (the digits swap), and it is accessible
// (the full value is the element's text for assistive technology). Money figures are tabular and in the display face
// through the `font-display` and `tabular-nums` classes; colours come from the caller's token classes.

import NumberFlow, { type Format, type Value } from "@number-flow/react";

import { cn } from "@kawase/ui-web/lib/utils";

export type OdometerProps = {
  value: Value;
  /** Intl.NumberFormat options: `{ style: "currency", currency: "USD" }`, `{ maximumFractionDigits: 2 }`. */
  format?: Format;
  locales?: string | string[];
  prefix?: string;
  suffix?: string;
  /** `0` rolls every changed digit the same way; `undefined` follows the direction of the change (up on a rise). */
  trend?: number;
  className?: string;
};

export function Odometer({ value, format, locales, prefix, suffix, trend, className }: OdometerProps) {
  return (
    <NumberFlow
      value={value}
      {...(format ? { format } : {})}
      {...(locales ? { locales } : {})}
      {...(prefix ? { prefix } : {})}
      {...(suffix ? { suffix } : {})}
      {...(trend !== undefined ? { trend } : {})}
      className={cn("tabular-nums", className)}
    />
  );
}

export default Odometer;
