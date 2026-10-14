/**
 * Action circles (D-196: 56 pt + label; Solflare S21's Copy / Share, Phantom's Receive / Send row). Ported in spirit
 * from 21st.dev radiumcoders/grid-button (#13564): an icon disc over a short label, the disc shrinking to 0.97 under the
 * finger. A disabled circle keeps its place and says why in ≤ 4 words under its label.
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Icon as KitIcon, type SymbolIcon } from "./icons";
import { usePressScale } from "./usePressScale";
import { fire } from "@/feedback/fire";
import { CONTROL_FONT_SCALE, DISABLED_OPACITY, RADIUS, SIZE, SPACE, TYPE, useTheme } from "./theme";

const CIRCLE = 56;
/** A pressed brand disc dims instead of changing colour. */
const PRESSED = 0.8;

export function ActionCircle({
  icon: Icon,
  glyph,
  label,
  accessibilityLabel,
  onPress,
  reason,
  note,
  primary = false,
  busy = false,
}: {
  icon?: SymbolIcon;
  /** Artwork in place of a symbol — a brand's own mark (X on the receipt's Post). */
  glyph?: ReactNode;
  label: string;
  /** When the label alone isn't the whole name ("Post on X"). */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Why it can't be used here ("Real money only"); the circle stays, inert. */
  reason?: string | undefined;
  /** A caveat that doesn't stop it ("Sell only"). */
  note?: string | undefined;
  /** The row's one main action, on the brand colour (Replay on a receipt). */
  primary?: boolean;
  /** Working: inert, with a spinner in the disc. */
  busy?: boolean;
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const disabled = reason !== undefined || busy;
  const fill = primary ? color.accent : color.raised2;
  const ink = primary ? color.accentForeground : color.ink;
  return (
    <View style={[styles.slot, reason !== undefined ? styles.dim : null]}>
      <Animated.View style={press.style}>
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => {
            fire("press");
            onPress();
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={reason ? `${accessibilityLabel ?? label}, ${reason}` : (accessibilityLabel ?? label)}
          accessibilityState={{ disabled, busy }}
          style={({ pressed }) => [
            styles.circle,
            {
              backgroundColor: pressed && !primary ? color.rowPressed : fill,
              opacity: pressed && primary ? PRESSED : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={ink} />
          ) : (
            (glyph ?? (Icon ? <KitIcon icon={Icon} size={SIZE.icon} tint={ink} /> : null))
          )}
        </Pressable>
      </Animated.View>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, styles.center, { color: color.ink }]}>
        {label}
      </Text>
      {reason || note ? (
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          numberOfLines={2}
          style={[TYPE.meta, styles.center, { color: color.text3 }]}
        >
          {reason ?? note}
        </Text>
      ) : null}
    </View>
  );
}

/** A row of circles spread evenly (Receive · Send · Swap · Withdraw; Copy · Share · Explorer). */
export function ActionCircles({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start", gap: SPACE.sm },
  slot: { alignItems: "center", gap: SPACE.xs, flex: 1, minWidth: 0, maxWidth: CIRCLE + SPACE.xxl },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  dim: { opacity: DISABLED_OPACITY },
});
