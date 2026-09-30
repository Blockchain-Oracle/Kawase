// Native twin of ui-web's order-confirmation-card (21st.dev kavikatiyar/order-confirmation-card), same props.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { CircleCheck } from "lucide-react-native";
import type * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

const APPEAR_MS = 400;

type ReceiptCardProps = {
  title: string;
  details: { label: string; value: string; isBold?: boolean }[];
  buttonText: string;
  onAction: () => void;
  badge?: string;
  icon?: React.ReactNode;
  /** Tighter spacing and a smaller mark, for use inside a chat thread. */
  compact?: boolean;
  className?: string;
};

function ReceiptCard({
  title,
  details,
  buttonText,
  onAction,
  badge,
  icon,
  compact = false,
  className,
}: ReceiptCardProps) {
  return (
    // The entering motion sits on its own wrapper, so a theme change during it cannot leave stale colours.
    <Animated.View entering={FadeIn.duration(APPEAR_MS)} className="w-full">
      <View
        accessibilityLiveRegion="polite"
        className={cn(
          "border-border bg-card w-full items-center rounded-xl border",
          compact ? "gap-3 p-4" : "gap-6 p-6",
          className,
        )}
      >
        {icon ?? <Icon as={CircleCheck} className={cn("text-success", compact ? "size-8" : "size-12")} />}

        {badge ? (
          <View className="bg-network-surface rounded-full px-2.5 py-0.5">
            <Text className="text-network text-xs font-medium">{badge}</Text>
          </View>
        ) : null}

        <Text role="heading" className={cn("font-display text-center font-semibold", compact ? "text-xl" : "text-2xl")}>
          {title}
        </Text>

        <View className={cn("w-full", compact ? "gap-2.5 pt-1" : "gap-4 pt-4")}>
          {details.map((item, index) => (
            <View
              key={item.label}
              className={cn(
                "border-border flex-row items-center justify-between gap-4",
                index < details.length - 1 && (compact ? "border-b pb-2.5" : "border-b pb-4"),
              )}
            >
              <Text className={cn("text-sm", item.isBold ? "text-card-foreground font-bold" : "text-muted-foreground")}>
                {item.label}
              </Text>
              <Text
                className={cn(
                  "shrink text-end",
                  item.isBold ? "text-card-foreground text-lg font-bold" : "text-muted-foreground text-sm",
                )}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <Button
          onPress={onAction}
          className={cn("bg-network active:bg-network/90 w-full", compact ? "mt-1 h-10" : "mt-4 h-12")}
        >
          <Text className="text-network-foreground text-base font-medium">{buttonText}</Text>
        </Button>
      </View>
    </Animated.View>
  );
}

export { ReceiptCard };
export type { ReceiptCardProps };
