// The card that rises from the bottom when a payment needs the user's approval (DESIGN.md, Koe).
// It shows exactly what will be sent and to whom, and it never dismisses itself.
import { Amount } from "@kawase/ui-native/components/amount";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";

const RISE_MS = 250;

type ConfirmRow = {
  label: string;
  value: string;
  /** Shown in mono next to the value, for example a shortened address. */
  detail?: string;
  /** The amount row: large mono figures. */
  emphasis?: boolean;
};

type ConfirmSheetProps = {
  rows: ConfirmRow[];
  /** The action area: a Button (for example "Confirm with Face ID") or HoldToConfirm, and a cancel button. */
  children: React.ReactNode;
  className?: string;
  /** For the bottom safe-area padding. */
  style?: StyleProp<ViewStyle>;
};

function ConfirmSheet({ rows, children, className, style }: ConfirmSheetProps) {
  // The entering motion sits on its own wrapper: a theme change during the animation would otherwise leave the
  // animated view with the previous theme's colours.
  return (
    <Animated.View entering={SlideInDown.duration(RISE_MS)}>
      <View style={style} className={cn("border-border bg-card rounded-t-[28px] border-t px-5 pb-7 pt-3", className)}>
        <View className="bg-muted mb-4 h-1 w-10 self-center rounded-full" />
        <View className="gap-1 pb-4">
          {rows.map((row) => (
            <View key={row.label} className="flex-row items-baseline justify-between gap-4">
              <Text className="text-muted-foreground text-sm">{row.label}</Text>
              {row.emphasis ? (
                <Amount className="text-2xl font-semibold">{row.value}</Amount>
              ) : (
                <Text className="shrink text-end text-sm">
                  {row.value}
                  {row.detail ? (
                    <>
                      {" · "}
                      <Amount className="text-sm">{row.detail}</Amount>
                    </>
                  ) : null}
                </Text>
              )}
            </View>
          ))}
        </View>
        <View className="gap-2">{children}</View>
      </View>
    </Animated.View>
  );
}

export { ConfirmSheet };
export type { ConfirmRow, ConfirmSheetProps };
