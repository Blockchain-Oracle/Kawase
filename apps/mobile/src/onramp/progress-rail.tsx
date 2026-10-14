// The purchase's progress rail: Paying · Buying · On Arc (a delivery on Base adds Bridging). Native twin of 21st.dev
// sean0205 "Stepper" (id 3734, horizontal orientation): numbered discs joined by a bar, the finished ones filled with
// a check, the running one ringed, the next ones quiet. Kawase adds the failed state (a cross, in the error colour)
// and the bar that fills as a step finishes (Reanimated; reduced motion makes it an instant change).
import { Check, X } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

export type RailStepState = "done" | "active" | "pending" | "failed";
export type RailItem = { id: string; label: string; state: RailStepState };

const DISC = 28;
const BAR = 3;
const FILL_MS = 480;
const FILL_REDUCED_MS = 100;

/** The bar between two steps, filling left to right once the step before it is done. */
function Connector({ filled }: { filled: boolean }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(filled ? 1 : 0);
  React.useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, { duration: reduced ? FILL_REDUCED_MS : FILL_MS });
  }, [filled, progress, reduced]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View className="bg-muted mx-1 flex-1 overflow-hidden rounded-full" style={{ height: BAR }}>
      <Animated.View className="bg-primary h-full" style={style} />
    </View>
  );
}

export function ProgressRail({ items, className }: { items: RailItem[]; className?: string }) {
  return (
    <View className={cn("w-full", className)} accessibilityRole="list">
      <View className="flex-row items-center">
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <View
              accessibilityRole="text"
              accessibilityLabel={`${index + 1}. ${item.label}`}
              accessibilityState={{ selected: item.state === "active", disabled: item.state === "pending" }}
              className={cn(
                "items-center justify-center rounded-full border-2",
                item.state === "done" && "border-primary bg-primary",
                item.state === "failed" && "border-destructive bg-destructive",
                item.state === "active" && "border-primary bg-background",
                item.state === "pending" && "border-muted bg-muted",
              )}
              style={{ width: DISC, height: DISC }}
            >
              {item.state === "done" ? (
                <Icon as={Check} className="text-primary-foreground size-4" />
              ) : item.state === "failed" ? (
                <Icon as={X} className="text-destructive-foreground size-4" />
              ) : (
                <Text className={cn("text-xs font-bold", item.state === "active" ? "text-foreground" : "text-muted-foreground")}>{index + 1}</Text>
              )}
            </View>
            {index < items.length - 1 ? <Connector filled={item.state === "done"} /> : null}
          </React.Fragment>
        ))}
      </View>
      <View className="mt-2 flex-row">
        {items.map((item) => (
          <Text key={item.id} className={cn("flex-1 text-center text-xs", item.state === "active" ? "text-foreground font-semibold" : "text-muted-foreground")} numberOfLines={1}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
