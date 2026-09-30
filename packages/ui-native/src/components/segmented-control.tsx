// Native twin of ui-web's segmented-control (21st.dev ddoemonn/segmented-control), same props:
// a thumb slides under the selected segment.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const THUMB_SPRING = { stiffness: 520, damping: 34, mass: 0.45 } as const;

type SegmentedOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SegmentedControlProps = {
  options: SegmentedOption[];
  /** The accessible name of the group, for example "Network". */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

const SEGMENT_PADDING_X = 12;

function SegmentedControl({ options, label, value, defaultValue, onValueChange, className }: SegmentedControlProps) {
  const [internal, setInternal] = React.useState(() => defaultValue ?? options[0]?.value ?? "");
  const [labelWidths, setLabelWidths] = React.useState<Record<string, number>>({});
  const current = value ?? internal;
  const found = options.findIndex((option) => option.value === current);
  const index = found < 0 ? 0 : found;

  // Every segment is as wide as the longest label, so the thumb can slide by whole segments.
  const widest = Math.max(0, ...options.map((option) => labelWidths[option.value] ?? 0));
  const measured = options.every((option) => labelWidths[option.value] !== undefined);
  const segmentWidth = Math.ceil(widest) + SEGMENT_PADDING_X + SEGMENT_PADDING_X;

  const position = useSharedValue(index);
  React.useEffect(() => {
    position.value = withSpring(index, THUMB_SPRING);
  }, [index, position]);

  // `start` (not a transform) so the thumb follows the layout direction in Arabic and Urdu.
  const thumb = useAnimatedStyle(() => ({ start: position.value * segmentWidth, width: segmentWidth }));

  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    if (next !== current) onValueChange?.(next);
  };

  return (
    <View
      role="radiogroup"
      accessibilityLabel={label}
      className={cn("border-border bg-muted self-start rounded-full border p-[3px]", className)}
    >
      <View className="flex-row">
        {measured ? (
          <Animated.View pointerEvents="none" style={thumb} className="absolute inset-y-0">
            <View className="bg-foreground flex-1 rounded-full" />
          </Animated.View>
        ) : null}
        {options.map((option, optionIndex) => {
          const selected = optionIndex === index;
          return (
            <Pressable
              key={option.value}
              role="radio"
              accessibilityState={{ checked: selected, disabled: option.disabled ?? false }}
              disabled={option.disabled}
              onPress={() => select(option.value)}
              style={measured ? { width: segmentWidth } : { paddingHorizontal: SEGMENT_PADDING_X }}
              className="items-center py-[7px]"
            >
              <Text
                numberOfLines={1}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  setLabelWidths((previous) =>
                    previous[option.value] === width ? previous : { ...previous, [option.value]: width },
                  );
                }}
                className={cn(
                  "text-[13px] font-medium leading-[18px]",
                  option.disabled ? "text-muted-foreground/50" : selected ? "text-background" : "text-muted-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { SegmentedControl };
export type { SegmentedControlProps, SegmentedOption };
