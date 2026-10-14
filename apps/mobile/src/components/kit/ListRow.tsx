import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fire } from "@/feedback/fire";
import { SIZE, SPACE, TYPE, useTheme } from "./theme";
import { ChevronRight, Icon } from "./icons";

/**
 * A settings/list row inside a filled group: an optional leading identity (real marks), title, optional detail, a
 * chevron when it navigates or a trailing control when it doesn't. Rows are separated by their own height, not by
 * lines (Fomo F16/F20: no row borders).
 */
export function ListRow({
  title,
  detail,
  detailLines,
  onPress,
  leading,
  trailing,
}: {
  title: string;
  detail?: string | undefined;
  /** Clip the detail to this many lines (a token's name beside its price); unclipped by default (reasons wrap). */
  detailLines?: number | undefined;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { color } = useTheme();
  const body = (
    <>
      {leading}
      <View style={styles.text}>
        <Text style={[TYPE.row, { color: color.ink }]}>{title}</Text>
        {detail ? (
          <Text numberOfLines={detailLines} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon icon={ChevronRight} size={SIZE.iconSm} tint={color.text3} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: color.rowPressed } : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    minHeight: SIZE.rowMinHeight - SPACE.sm,
  },
  text: { flex: 1, gap: SPACE.xxs },
});
