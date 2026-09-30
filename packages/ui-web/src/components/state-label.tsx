// Kawase glue: the agent's current state ("Listening", "Thinking", "Speaking"): small, accent-coloured, and
// spaced-out capitals in scripts that have capitals. Arabic, Urdu, Hindi, Bengali and Chinese are never
// letter-spaced (spacing breaks joined scripts).
import { hasUncasedScript } from "@kawase/i18n";
import { cn } from "@kawase/ui-web/lib/utils";

export function StateLabel({ children, className }: { children: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "text-center text-xs font-semibold text-accent",
        hasUncasedScript(children) ? "text-sm" : "uppercase tracking-widest",
        className,
      )}
    >
      {children}
    </div>
  );
}
