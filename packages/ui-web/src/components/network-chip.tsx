// Kawase glue (no 21st equivalent): the network is always named in words, never by colour alone (DESIGN.md).
import { Waypoints } from "lucide-react";

import { cn } from "@kawase/ui-web/lib/utils";

export function NetworkChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-network-surface px-2.5 py-1 text-xs font-semibold text-network", className)}>
      <Waypoints className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function TestnetStrip({ label, className }: { label: string; className?: string }) {
  return (
    <div role="banner" className={cn("bg-network-surface px-4 py-1.5 text-center text-xs font-semibold text-network", className)}>
      {label}
    </div>
  );
}
