// The Marketplace's front door where people already are (discoverability audit 10-15): on a phone the marketplace
// was three taps deep under a chip called "Services". One row on Markets, above the tokens: the real logos of the
// first tools in the catalog, overlapping; "Marketplace"; how many tools the agent can pay for; an arrow. A tap opens
// the whole marketplace. While the catalog loads, the logo stack is the stack's own shape; if it can't load, the row
// still opens the marketplace (which says why).
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { ChevronRight, Icon } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { usePressScale } from "@/components/kit/usePressScale";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { ToolMark } from "./tool-parts";
import { useCatalog } from "./use-catalog";

const FACES = 4;
const FACE = 30;
/** How far each logo tucks under the one before it. */
const OVERLAP = 10;
const RING = 2;
/** A placeholder disc is the size of a logo with its ring on both sides. */
const GHOST = FACE + RING + RING;
const ROW_PRESS = 0.985;

export function MarketplaceEntry() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const press = usePressScale(ROW_PRESS);
  const catalog = useCatalog("", null);
  // Logos first: a tool with its own mark or site icon, never an initials disc in the stack.
  const faces = catalog.tools.filter((tool) => tool.mark || tool.logo).slice(0, FACES);
  const total = catalog.view?.totals.tools ?? 0;
  const title = t("shell.dock.marketplace");
  const body = total > 0 ? t("market402.entryBody", { n: total }) : t("market402.entryBodyIdle");

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${title}, ${body}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          router.push("/marketplace");
        }}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? color.rowPressed : color.card }]}
      >
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {faces.length > 0
            ? faces.map((tool, index) => (
                <View key={tool.key} style={[styles.face, { marginStart: index === 0 ? 0 : -OVERLAP, borderColor: color.card, zIndex: FACES - index }]}>
                  <ToolMark tool={tool} size={FACE} />
                </View>
              ))
            : Array.from({ length: FACES }, (_, index) => (
                <View
                  key={index}
                  style={[styles.face, styles.ghost, { marginStart: index === 0 ? 0 : -OVERLAP, borderColor: color.card, backgroundColor: color.raised2, zIndex: FACES - index }]}
                />
              ))}
        </View>
        <View style={styles.grow}>
          <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {body}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={SIZE.iconSm} tint={color.text3} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: SIZE.rowMinHeight, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.md },
  stack: { flexDirection: "row", alignItems: "center" },
  face: { borderWidth: RING, borderRadius: RADIUS.pill },
  ghost: { width: GHOST, height: GHOST },
  grow: { flex: 1, gap: SPACE.xxs },
});
