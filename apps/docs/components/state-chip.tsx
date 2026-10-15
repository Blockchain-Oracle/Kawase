import type { CapabilityState } from "@kawase/config";

// A state is always a word plus a shape, never colour alone (DESIGN.md rules). Live is a magenta dot beside the word in
// ink, the landing's mark for "runs on that network today" (10-15: no green left from the old brand).
const STYLE: Record<CapabilityState, string> = {
  available: "border-border bg-card text-foreground",
  coming: "border-border bg-muted text-muted-foreground",
  unavailable: "border-transparent text-muted-foreground",
};
const GLYPH: Record<CapabilityState, string> = { available: "●", coming: "◌", unavailable: "–" };

export function StateChip({ state, label }: { state: CapabilityState; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLE[state]}`}
    >
      <span aria-hidden="true" className={state === "available" ? "text-accent" : undefined}>
        {GLYPH[state]}
      </span>
      {label}
    </span>
  );
}
