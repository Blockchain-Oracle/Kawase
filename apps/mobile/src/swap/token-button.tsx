// One side of the swap (or bridge) ticket: the token's real mark, its symbol and a chevron, on a quiet plate (21st ssychui
// "Swap Ticket" #27122's token pill). Opens the universal asset picker.
import type * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TokenView } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Icon, SIZE, SPACE, TYPE, useTheme, usePressScale } from "@/components/kit";
import { ChevronDown } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import Animated from "react-native-reanimated";

export type TicketToken = Pick<TokenView, "chainId" | "address" | "symbol" | "name" | "decimals" | "logoUrl">;

const HALF = 2;
const BORDER = 1.5;

export function TokenButton({ token, label, caption, onPress }: { token: TicketToken; label: string; caption?: string | undefined; onPress: () => void }) {
  return <TicketPill mark={<TokenMark token={token} size={SIZE.markToken} />} label={label} value={token.symbol} caption={caption} onPress={onPress} />;
}

/**
 * The ticket's pill: a mark, what this side is ("You pay", "To"), its value and a chevron. Shared by the swap's tokens
 * and the bridge's chains. Without `onPress` it is a fixed side (Arc, on a bridge) and draws no chevron; with
 * `placeholder` the value reads quieter until something is chosen.
 */
export function TicketPill({
  mark,
  label,
  value,
  caption,
  placeholder = false,
  onPress,
}: {
  mark?: React.ReactNode;
  label: string;
  value: string;
  caption?: string | undefined;
  placeholder?: boolean;
  onPress?: (() => void) | undefined;
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const body = (
    <>
      {mark}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[TYPE.meta, { color: color.text2 }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[TYPE.rowTitle, { color: placeholder ? color.text2 : color.ink }]}>
          {value}
        </Text>
        {caption ? (
          <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
            {caption}
          </Text>
        ) : null}
      </View>
      {onPress ? <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.grow, styles.plate, { backgroundColor: color.raised2 }]}>{body}</View>;
  return (
    <Animated.View style={[styles.grow, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={[styles.plate, { backgroundColor: placeholder ? color.transparent : color.raised2, borderColor: placeholder ? color.accent : color.transparent }]}
      >
        {body}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  plate: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: SIZE.fieldHeight / HALF, borderWidth: BORDER, borderColor: "transparent", paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, minHeight: SIZE.fieldHeight },
  text: { flex: 1, minWidth: 0 },
});
