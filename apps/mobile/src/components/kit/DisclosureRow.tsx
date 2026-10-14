/**
 * One line that opens (UGLYCASH's "Fee: $0.95 ⌄", Codex direction 16): a title and its value at rest, the detail or
 * the control only when tapped. How a settings sheet keeps one thing per line instead of printing everything.
 */
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChevronDown, Icon } from "./icons";
import { fire } from "@/feedback/fire";
import { SIZE, SPACE, TYPE, useTheme } from "./theme";

const ROW = 56;

export function DisclosureRow({ title, value, children }: { title: string; value: string; children: ReactNode }) {
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => {
          fire("tick");
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${value}`}
        style={styles.row}
      >
        <Text style={[TYPE.row, styles.title, { color: color.ink }]}>{title}</Text>
        <Text style={[TYPE.rowAmount, { color: color.ink }]}>{value}</Text>
        <View style={open ? styles.flip : undefined}>
          <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.inkMuted} />
        </View>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: ROW },
  title: { flex: 1 },
  flip: { transform: [{ rotate: "180deg" }] },
  body: { gap: SPACE.sm, paddingBottom: SPACE.md },
});
