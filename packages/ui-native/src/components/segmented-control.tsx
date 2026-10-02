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
  // Each segment's own frame (physical x and width, from its layout). Measuring the segment rather than its label
  // is what Android needs: a label's layout can arrive before the font does and never again (seen on Android 16).
  const [frames, setFrames] = React.useState<Record<string, { x: number; width: number }>>({});
  const current = value ?? internal;
  const found = options.findIndex((option) => option.value === current);
  const index = found < 0 ? 0 : found;

  // Every segment is as wide as the widest one, so the control reads as one even row.
  const widest = Math.max(0, ...options.map((option) => frames[option.value]?.width ?? 0));
  const frame = frames[options[index]?.value ?? ""];

  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = React.useRef(false);
  React.useEffect(() => {
    if (!frame) return;
    // The first placement is immediate; changes of selection slide.
    left.value = placed.current ? withSpring(frame.x, THUMB_SPRING) : frame.x;
    width.value = placed.current ? withSpring(frame.width, THUMB_SPRING) : frame.width;
    placed.current = true;
  }, [frame, left, width]);

  // `left` is physical, like the measured x, so the thumb lands right in left-to-right and right-to-left trees alike.
  const thumb = useAnimatedStyle(() => ({ left: left.value, width: width.value }));

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
        {frame ? (
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
              onLayout={(event) => {
                const { x, width: measured } = event.nativeEvent.layout;
                setFrames((previous) => {
                  const was = previous[option.value];
                  return was && was.x === x && was.width === measured ? previous : { ...previous, [option.value]: { x, width: measured } };
                });
              }}
              style={{ paddingHorizontal: SEGMENT_PADDING_X, minWidth: widest || undefined }}
              className="items-center py-[7px]"
            >
              <Text
                numberOfLines={1}
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
