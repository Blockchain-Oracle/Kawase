// The frame of every money page in this lane (trade, position, send, withdraw, earn, borrow, token), on the Senryo kit.
// Phone: the testnet strip (only outside the desktop frame, which draws one for every page), a 44 pt back plate, the
// page title in the condensed money face, an optional real mark at the end, then the page. Desktop (useWide): the
// same header with air above it (no status bar), then two columns, the stage (what you are looking at, flexible)
// and the ticket (what you are doing, a fixed column at the reading end), each scrolling on its own, so the ticket
// never scrolls away from the numbers it acts on (the Kraken Pro / Wise layout in 08-references).
import { Stack } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { useWide, WideFrameContext, WIDE_PAGE_PX } from "@kawase/ui-native/lib/wide";

import { Icon, LAYOUT, SIZE, SPACE, TYPE, useTheme, usePressScale } from "@/components/kit";
import { ChevronLeft } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const HALF = 2;
/** Air above the header on a desktop window (no status bar to clear). */
const WIDE_TOP = SPACE.xl;
/** The ticket column: 400 on a desktop window, 440 from 1280 (Senryo's drawer widths sit either side of it). */
export const TICKET_COLUMN = 400;
export const TICKET_COLUMN_XL = 440;
const XL_PX = 1280;

/**
 * A route of this lane laid out wider than the stack's 720 px column on a desktop window, so its two columns fit (the
 * token page has the same width from the app layout). Rendered by the route file, which owns its screen options.
 */
export function WidePage({ max = WIDE_PAGE_PX }: { max?: number }) {
  const wide = useWide();
  return wide ? <Stack.Screen options={{ contentStyle: { width: "100%", alignSelf: "center", maxWidth: max } }} /> : null;
}

/** The back plate: a 44 pt quiet circle, the chevron mirrored in Arabic and Urdu. */
export function BackPlate({ onPress }: { onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const { rtl } = useLocale();
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={SPACE.xs}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={[styles.back, { backgroundColor: color.raised2 }]}
      >
        <View style={rtl ? styles.mirror : undefined}>
          <Icon icon={ChevronLeft} size={SIZE.icon} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function PageHeader({ title, subtitle, onBack, trailing }: { title: string; subtitle?: string | undefined; onBack: () => void; trailing?: React.ReactNode }) {
  const { t } = useT();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const inFrame = React.useContext(WideFrameContext);
  const { user } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const strip = testnet && !inFrame;
  const top = wide ? WIDE_TOP : strip ? SPACE.md : insets.top + SPACE.md;
  return (
    <View>
      {strip ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View style={[styles.header, { paddingTop: top, paddingHorizontal: wide ? SPACE.xl : SPACE.inset }]}>
        <BackPlate onPress={onBack} />
        <View style={styles.titles}>
          <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.pageTitle, { color: color.ink }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
    </View>
  );
}

/**
 * The desktop body: the stage and the ticket side by side, each its own scroll. `ticketWidth` follows the window
 * (wider from 1280). On a phone this is never drawn: each page keeps its own one-column flow.
 */
export function Columns({ stage, ticket, stageScroll = true }: { stage: React.ReactNode; ticket: React.ReactNode; stageScroll?: boolean }) {
  const [width, setWidth] = React.useState(0);
  const ticketWidth = width >= XL_PX - LAYOUT.railWide ? TICKET_COLUMN_XL : TICKET_COLUMN;
  return (
    <View style={styles.columns} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {stageScroll ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.stage} keyboardShouldPersistTaps="handled">
          {stage}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.stage]}>{stage}</View>
      )}
      <ScrollView style={{ width: ticketWidth, flexGrow: 0 }} contentContainerStyle={styles.ticket} keyboardShouldPersistTaps="handled">
        {ticket}
      </ScrollView>
    </View>
  );
}

/** The phone page body: one scroll with the gutter and room under it. */
export function PhoneScroll({ children, bottom = SPACE.xxl }: { children: React.ReactNode; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.phone, { paddingBottom: insets.bottom + bottom }]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / HALF, alignItems: "center", justifyContent: "center" },
  mirror: { transform: [{ scaleX: -1 }] },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingBottom: SPACE.sm },
  titles: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  columns: { flex: 1, flexDirection: "row", gap: SPACE.xl, paddingHorizontal: SPACE.xl },
  stage: { gap: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.xxxl },
  ticket: { gap: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: SPACE.xxxl },
  phone: { gap: SPACE.xl, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
});
