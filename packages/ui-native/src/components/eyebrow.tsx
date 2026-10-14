// The small label above a section or a group of rows ("First steps", "Recent", "Appearance"). In scripts that
// have capitals it is set in spaced-out capitals; Arabic, Urdu, Hindi, Bengali and Chinese are never
// letter-spaced or upper-cased (spacing breaks joined scripts), so they get a slightly larger plain label.
import { hasUncasedScript } from "@kawase/i18n/scripts";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

function Eyebrow({ children, className }: { children: string; className?: string }) {
  return (
    <Text className={cn("text-muted-foreground text-xs font-semibold", hasUncasedScript(children) ? "text-sm" : "uppercase tracking-wider", className)}>
      {children}
    </Text>
  );
}

export { Eyebrow };
