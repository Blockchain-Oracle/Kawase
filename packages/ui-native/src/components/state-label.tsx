// The agent's current state ("Listening", "Thinking", "Speaking"): small, accent-coloured, and spaced-out
// capitals in scripts that have capitals. Arabic, Urdu, Hindi, Bengali and Chinese are never letter-spaced
// (spacing breaks joined scripts).
import { hasUncasedScript } from "@kawase/i18n/scripts";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

function StateLabel({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      className={cn(
        "text-accent text-center text-xs font-semibold",
        hasUncasedScript(children) ? "text-sm" : "uppercase tracking-widest",
        className,
      )}
    >
      {children}
    </Text>
  );
}

export { StateLabel };
