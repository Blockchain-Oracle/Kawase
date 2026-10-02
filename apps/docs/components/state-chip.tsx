import type { CapabilityState } from "@kawase/config";

// A state is always a word plus a shape, never colour alone (DESIGN.md rules). Mint marks "available" so lime stays
// reserved for the one primary action.
const STYLE: Record<CapabilityState, string> = {
  available: "border-success/40 bg-success/10 text-success",
  coming: "border-border bg-muted text-muted-foreground",
  unavailable: "border-transparent text-muted-foreground",
};
const GLYPH: Record<CapabilityState, string> = { available: "●", coming: "◌", unavailable: "–" };

export function StateChip({ state, label }: { state: CapabilityState; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLE[state]}`}
    >
      <span aria-hidden="true">{GLYPH[state]}</span>
      {label}
    </span>
  );
}
