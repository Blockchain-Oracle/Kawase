// The card base every agent result sits on (revamp Phase A: "the ~40 cards inherit the material"): an ink card with
// a hairline, an eyebrow row (what it is · which network), the content, and an optional action row.
import { View } from "react-native";

import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

export function AgentCard({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("bg-card border-border gap-3 rounded-3xl border p-4", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {children}
    </View>
  );
}

const LINE_WIDTH = 140;
const LINE_SHORT = 90;

/** While a tool runs: the card's shape with a live line ("Checking your wallet…"). */
export function AgentCardLoading({ label }: { label: string }) {
  return (
    <AgentCard>
      <Text accessibilityLiveRegion="polite" className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {label}
      </Text>
      <Skeleton className="h-4 rounded-md" style={{ width: LINE_WIDTH }} />
      <Skeleton className="h-4 rounded-md" style={{ width: LINE_SHORT }} />
    </AgentCard>
  );
}
