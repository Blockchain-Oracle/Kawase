// A capability state as a word plus a shape, never colour alone (DESIGN.md). Mint marks "available" so lime stays
// for the one primary action and live state.
import type { CapabilityState } from "@kawase/config";

import { STATE_LABEL } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

const STYLE: Record<CapabilityState, string> = {
  available: "border-success/40 bg-success/10 text-success",
  coming: "border-border bg-muted text-muted-foreground",
  unavailable: "border-border text-muted-foreground",
};
const GLYPH: Record<CapabilityState, string> = { available: "●", coming: "◌", unavailable: "–" };

export function StateChip({ state, prefix, className }: { state: CapabilityState; prefix?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STYLE[state],
        className,
      )}
    >
      <span aria-hidden="true">{GLYPH[state]}</span>
      {prefix ? <span className="text-foreground/70">{prefix}</span> : null}
      {STATE_LABEL[state]}
    </span>
  );
}
