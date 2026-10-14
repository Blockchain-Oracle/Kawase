/**
 * A scrolling row of filter chips (the market sheet's Favourites · Hot · All · Crypto…, P2): borderless capsules on the
 * raised fill, the selected one inked like the terminal's lane chips. `bleed` lets the row run to a container's edges
 * while its first chip still lines up with the content.
 */
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { fire } from "@/feedback/fire";
import { SIZE, SPACE, TYPE, useTheme } from "./theme";

const CHIP_HEIGHT = SIZE.touch - SPACE.sm;
const HALF = 2;

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  bleed = 0,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  /** Group name for VoiceOver ("Market filter"). */
  label: string;
  bleed?: number;
}) {
  const { color } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (selected) return;
              fire("tick");
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.chip, { backgroundColor: selected ? color.ink : color.raised2 }]}
          >
            <Text style={[TYPE.micro, { color: selected ? color.ground : color.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACE.sm },
  chip: {
    justifyContent: "center",
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: SPACE.md,
    borderRadius: CHIP_HEIGHT / HALF,
  },
});
