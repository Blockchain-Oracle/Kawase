// A marketplace tool as a row (phone) or a card (desktop grid), after 21st.dev ddoemonn/filter-grid #23525 (cells that
// reflow as the filter changes, counts on the chips) and deltacomponents/product-card #28200 (mark, name, price, one
// line under it). Each shows the tool's real mark (the registry's, or the seller's own site icon for a first-party
// tool), its name, price per call, "≈ N calls per $1" and whether the seller made it (1P) or resells it (3P). A tool
// without a mark gets its initials on a quiet disc, never someone else's logo.
import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";

import type { CatalogToolView } from "@kawase/api-client";
import { amount, formatPrice } from "@kawase/money";
import { Mark } from "@kawase/ui-native/components/mark";

import { RADIUS, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit/theme";
import { usePressScale } from "@/components/kit/usePressScale";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { API_URL } from "@/session/api";

const INITIALS = 2;
const BADGE_SHARE = 0.42;
/** A brand icon sits inset on its own paper plate, so a square favicon reads like every other mark. */
const ICON_SHARE = 0.68;
const ROW_PRESS = 0.985;
const CALLS_COMPACT_FROM = 10_000;
const STAGGER_MAX = 8;
const HALF = 2;

/** "$0.002" with its sub-cent digits, in the person's language. */
export function usePerCall() {
  const { locale } = useLocale();
  return React.useCallback((baseUnits: string) => formatPrice(amount("USDC", BigInt(baseUnits)), locale), [locale]);
}

export function useCalls() {
  const { locale } = useLocale();
  return React.useCallback(
    (calls: number) => new Intl.NumberFormat(locale, calls >= CALLS_COMPACT_FROM ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(calls),
    [locale],
  );
}

/** The seller's own site icon, https only (first-party tools: the seller IS the tool). */
function siteIcon(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    return url.protocol === "https:" ? `${url.origin}/favicon.ico` : null;
  } catch {
    return null;
  }
}

/** `badge`: the reseller's mark at the corner of a third-party tool (off in a stack of logos, where it crowds). */
export function ToolMark({ tool, size = SIZE.markRow, badge: showBadge = true }: { tool: CatalogToolView; size?: number; badge?: boolean }) {
  const { color } = useTheme();
  const [iconFailed, setIconFailed] = React.useState(false);
  // The brand's own icon (served by the api for a resold tool, "Tavily" through Orthogonal), else a first-party
  // seller's site icon; the initials disc only when neither exists.
  const icon = tool.mark ? null : tool.logo ? `${API_URL.replace(/\/$/, "")}${tool.logo}` : tool.party === "first" ? siteIcon(tool.provider.website) : null;
  const badge = Math.round(size * BADGE_SHARE);
  const inner = Math.round(size * ICON_SHARE);
  let face: React.ReactNode;
  if (tool.mark) face = <Mark entity={tool.mark} size={size} />;
  else if (icon && !iconFailed)
    face = (
      <View style={[styles.plate, { width: size, height: size, backgroundColor: color.paper }]}>
        <Image source={{ uri: icon }} onError={() => setIconFailed(true)} style={{ width: inner, height: inner, borderRadius: RADIUS.xs }} accessibilityIgnoresInvertColors />
      </View>
    );
  else {
    const initials = tool.name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, INITIALS)
      .map((word) => word[0]!.toUpperCase())
      .join("");
    face = (
      <View style={[styles.disc, { width: size, height: size, backgroundColor: color.raised2 }]}>
        <Text style={[TYPE.chipLabel, { color: color.text2 }]}>{initials}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {face}
      {showBadge && tool.party === "third" && tool.providerMark ? (
        <View style={[styles.badge, { backgroundColor: color.card, borderRadius: RADIUS.pill }]}>
          <Mark entity={tool.providerMark} size={badge} />
        </View>
      ) : null}
    </View>
  );
}

function PartyPill({ party }: { party: CatalogToolView["party"] }) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: party === "first" ? color.selectedRow : color.raised2 }]}>
      <Text style={[TYPE.micro, { color: party === "first" ? color.link : color.text2 }]} accessibilityLabel={t(`market402.party_${party}`)}>
        {t(`market402.partyShort_${party}`)}
      </Text>
    </View>
  );
}

export function ToolRow({ tool, index, onPress }: { tool: CatalogToolView; index: number; onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const perCall = usePerCall();
  const calls = useCalls();
  const press = usePressScale(ROW_PRESS);
  const reduce = useReducedMotion();
  return (
    <Animated.View
      layout={reduce ? undefined : LinearTransition.duration(TIMING.selection)}
      entering={reduce ? undefined : FadeIn.duration(TIMING.staggerItem).delay(Math.min(index, STAGGER_MAX) * TIMING.stagger)}
      exiting={reduce ? undefined : FadeOut.duration(TIMING.press)}
      style={press.style}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tool.name}, ${t("market402.pricePerCall", { price: perCall(tool.price) })}, ${t(`market402.party_${tool.party}`)}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? color.rowPressed : color.card }]}
      >
        <ToolMark tool={tool} />
        <View style={styles.grow}>
          <View style={styles.titleLine}>
            <Text numberOfLines={1} style={[TYPE.rowTitle, styles.shrink, { color: color.ink }]}>
              {tool.name}
            </Text>
            <PartyPill party={tool.party} />
          </View>
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {[tool.provider.name, tool.endpoints > 1 ? t("market402.endpointsCount", { n: tool.endpoints }) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.end}>
          <Text style={[TYPE.rowAmount, { color: color.ink }]}>{perCall(tool.price)}</Text>
          <Text style={[TYPE.meta, { color: color.text3 }]}>{t("market402.callsShort", { calls: calls(tool.callsPerDollar) })}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ToolCard({ tool, onPress }: { tool: CatalogToolView; onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const perCall = usePerCall();
  const calls = useCalls();
  const press = usePressScale();
  const reduce = useReducedMotion();
  return (
    <Animated.View layout={reduce ? undefined : LinearTransition.duration(TIMING.selection)} entering={reduce ? undefined : FadeIn.duration(TIMING.staggerItem)} style={[styles.cardWrap, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tool.name}, ${t("market402.pricePerCall", { price: perCall(tool.price) })}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={({ pressed }) => [styles.card, { backgroundColor: pressed ? color.rowPressed : color.card }]}
      >
        <View style={styles.cardHead}>
          <ToolMark tool={tool} size={SIZE.markDetail} />
          <PartyPill party={tool.party} />
        </View>
        <View style={styles.cardText}>
          <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>
            {tool.name}
          </Text>
          <Text numberOfLines={2} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {tool.description || tool.provider.name}
          </Text>
        </View>
        <View style={styles.cardFoot}>
          <Text style={[TYPE.rowAmount, { color: color.ink }]}>{perCall(tool.price)}</Text>
          <Text style={[TYPE.meta, { color: color.text3 }]}>{t("market402.callsShort", { calls: calls(tool.callsPerDollar) })}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: SPACE.xxs },
  shrink: { flexShrink: 1 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  end: { alignItems: "flex-end", gap: SPACE.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: SIZE.rowMinHeight, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.md },
  disc: { borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  plate: { borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  badge: { position: "absolute", end: -SPACE.xxs, bottom: -SPACE.xxs, padding: SPACE.xxs / HALF },
  pill: { paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs / HALF, borderRadius: RADIUS.xs },
  cardWrap: { flexGrow: 1, flexBasis: 0 },
  card: { flex: 1, gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.lg },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardText: { gap: SPACE.xxs, flex: 1 },
  cardFoot: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.sm },
});
