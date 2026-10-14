// One side of the swap ticket: the token's real mark, its symbol and a chevron, on a quiet plate (21st ssychui
// "Swap Ticket" #27122's token pill). Opens the universal asset picker.
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TokenView } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Icon, SIZE, SPACE, TYPE, useTheme, usePressScale } from "@/components/kit";
import { ChevronDown } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import Animated from "react-native-reanimated";

export type TicketToken = Pick<TokenView, "chainId" | "address" | "symbol" | "name" | "decimals" | "logoUrl">;

const HALF = 2;

export function TokenButton({ token, label, caption, onPress }: { token: TicketToken; label: string; caption?: string | undefined; onPress: () => void }) {
  const { color } = useTheme();
  const press = usePressScale();
  return (
    <Animated.View style={[styles.grow, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${token.symbol}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={[styles.plate, { backgroundColor: color.raised2 }]}
      >
        <TokenMark token={token} size={SIZE.markToken} />
        <View style={styles.text}>
          <Text style={[TYPE.meta, { color: color.text2 }]}>{label}</Text>
          <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>
            {token.symbol}
          </Text>
          {caption ? (
            <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
              {caption}
            </Text>
          ) : null}
        </View>
        <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  plate: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: SIZE.fieldHeight / HALF, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, minHeight: SIZE.fieldHeight },
  text: { flex: 1, minWidth: 0 },
});
