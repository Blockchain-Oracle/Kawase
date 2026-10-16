// "Get the app" on the web app (Abu, 10-16: the landing's corner card "works well, put the same thing on the web app to
// promote our listing just a little"). Two shapes, one per kind of visitor, never inside an installed web app:
//
// - A desktop window: the landing's corner QR (apps/landing/src/components/landing/corner-card.tsx) made a small stub
//   of Kawase's receipt: the code to getkawase.xyz/download on paper, "Kawase on your phone". It floats in the stage's
//   end corner, the one free on every page (the composer and the voice island sit centred, Home's Trending column stops
//   high, drawers slide in above it). It appears a few seconds in and only when the page leaves it room: the gutter
//   beside the page's column must hold it, so it never sits on the composer or a page's content (Markets and the token
//   page, 1180 px wide, show it only on very wide windows). Hidden while the voice overlay is up.
// - A phone's browser: no code to scan (you are holding the phone). A slim strip at the top, the smart-banner shape,
//   that opens what that phone installs: TestFlight on an iPhone, the APK on Android. It slides in under the browser's
//   bar after a moment and pushes the page down rather than covering its header.
//
// Closing either keeps it closed for the visit (sessionStorage, like the landing's card).
import { PUBLIC_LINKS } from "@kawase/config";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
import { useWide, WIDE_COLUMN_PX, WIDE_PAGE_PX } from "@kawase/ui-native/lib/wide";
import { useSegments } from "expo-router";
import { X } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/kit/Button";
import { Icon } from "@/components/kit/icons";
import { EASE, ELEVATION, LAYOUT, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";

const KEY = "kawase.get-app.closed";
const DOWNLOAD = `${PUBLIC_LINKS.landing}/download`;

const CARD = { width: 164, pad: 12, plate: 140, radius: 22, plateRadius: 14, close: 26, closeIcon: 14 } as const;
/** The QR inside the paper plate, and the Kawase mark in its centre (error correction H keeps it readable). */
const QR = CARD.plate - SPACE.lg;
const QR_CENTER = 0.2;
/** It waits until the person has looked at the page they opened. */
const CARD_AFTER_MS = 4000;
/** Below this window height Home's Trending column would reach the card. */
const CARD_MIN_WINDOW_H = 760;
const CARD_IN_MS = 500;
const CARD_OUT_MS = 200;
/** Over a card's close button it lifts off the corner. */
const CLOSE_OFFSET = -9;

const STRIP_H = 60;
const STRIP_MARK = 38;
const STRIP_AFTER_MS = 900;
const STRIP_IN_MS = 320;
const STRIP_OUT_MS = 220;

type Device = "ios" | "android" | "desktop";
type Visit = { device: Device; installed: boolean; closed: boolean };

function deviceOf(): Device {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; its touch points give it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

/** Opened from the home screen or the dock as an installed web app: it already is "the app" there. */
function installed(): boolean {
  const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];
  return (
    modes.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function closedBefore(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function rememberClosed() {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Private mode: closed for this page view only.
  }
}

/** Read once in the browser (the server render has no window, so nothing shows until this resolves). */
function useVisit(): Visit | null {
  const [visit, setVisit] = React.useState<Visit | null>(null);
  React.useEffect(() => setVisit({ device: deviceOf(), installed: installed(), closed: closedBefore() }), []);
  return visit;
}

const openInNewTab = (url: string) => {
  fire("tick");
  window.open(url, "_blank", "noopener,noreferrer");
};

/** The width of what the current page lays out in the stage's middle (the gutter beside it is the card's room). */
function pageWidth(segments: readonly string[]): number {
  const markets = segments[1] === "(tabs)" && segments[2] === "markets";
  return markets || segments[1] === "token" ? WIDE_PAGE_PX : WIDE_COLUMN_PX;
}

/** The desktop card, mounted inside the stage (apps/mobile/src/app/(app)/_layout.tsx). */
export function GetAppCard() {
  const { t } = useT();
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const visit = useVisit();
  const wide = useWide();
  const stage = useStageFrame();
  const overlay = useOverlay();
  const segments = useSegments() as readonly string[];
  const { height } = useWindowDimensions();
  const [due, setDue] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setDue(true), CARD_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const room = stage ? (stage.width - pageWidth(segments)) / 2 - LAYOUT.inset * 2 : 0;
  const show =
    visit !== null &&
    visit.device === "desktop" &&
    !visit.installed &&
    !visit.closed &&
    !closed &&
    due &&
    wide &&
    room >= CARD.width &&
    height >= CARD_MIN_WINDOW_H &&
    overlay.current === null;
  if (!show) return null;

  const close = () => {
    fire("tick");
    setClosed(true);
    rememberClosed();
  };

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(CARD_IN_MS).easing(EASE)}
      exiting={reduced ? undefined : FadeOutDown.duration(CARD_OUT_MS)}
      style={styles.cardSpot}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t("getApp.cardLabel")}
        onPress={() => openInNewTab(DOWNLOAD)}
        className="cursor-pointer outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
        style={[styles.card, { backgroundColor: color.raised2 }, ELEVATION.dock]}
      >
        <View style={[styles.plate, { backgroundColor: color.paper }]}>
          <DottedQr value={DOWNLOAD} size={QR} dotColor={color.paperInk} background={color.paper} center={<KawaseMark size={QR * QR_CENTER} />} />
        </View>
        <View style={styles.cardWords}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]} numberOfLines={2}>
            {t("getApp.cardTitle")}
          </Text>
          <Text style={[TYPE.meta, { color: color.text2 }]} numberOfLines={2}>
            {t("getApp.cardScan")}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={close}
        hitSlop={SPACE.sm}
        className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.close,
          { backgroundColor: pressed || hovered ? color.rowPressed : color.raised2, borderColor: color.hairline },
          ELEVATION.button,
        ]}
      >
        <Icon icon={X} size={CARD.closeIcon} tint={color.text2} />
      </Pressable>
    </Animated.View>
  );
}

/** The phone strip, mounted above every page (apps/mobile/src/app/_layout.tsx). */
export function GetAppStrip() {
  const { t } = useT();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visit = useVisit();
  const [gone, setGone] = React.useState(false);
  const full = STRIP_H + insets.top;
  const height = useSharedValue(0);
  const phone = visit !== null && visit.device !== "desktop" && !visit.installed && !visit.closed;
  React.useEffect(() => {
    if (!phone) return;
    height.value = withDelay(STRIP_AFTER_MS, withTiming(full, { duration: reduced ? 0 : STRIP_IN_MS, easing: EASE }));
  }, [phone, full, reduced, height]);
  const grow = useAnimatedStyle(() => ({ height: height.value }));
  if (!visit || !phone || gone) return null;

  const ios = visit.device === "ios";
  const target = ios ? (PUBLIC_LINKS.testFlight ?? DOWNLOAD) : PUBLIC_LINKS.androidApk;
  const close = () => {
    fire("tick");
    rememberClosed();
    height.value = withTiming(0, { duration: reduced ? 0 : STRIP_OUT_MS, easing: EASE }, (done) => {
      if (done) runOnJS(setGone)(true);
    });
  };

  return (
    <Animated.View style={[styles.stripFrame, { backgroundColor: color.card, borderBottomColor: color.hairline }, grow]}>
      <View style={[styles.strip, { height: STRIP_H }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={close}
          hitSlop={SPACE.sm}
          style={({ pressed }) => [styles.stripClose, { backgroundColor: pressed ? color.rowPressed : color.transparent }]}
        >
          <Icon icon={X} size={SIZE.iconSm} tint={color.text2} />
        </Pressable>
        <KawaseMark size={STRIP_MARK} />
        <View style={styles.stripWords}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]} numberOfLines={1}>
            {ios ? t("getApp.stripTitleIos") : t("getApp.stripTitleAndroid")}
          </Text>
          <Text style={[TYPE.meta, { color: color.text2 }]} numberOfLines={1}>
            {ios ? t("getApp.stripDetailIos") : t("getApp.stripDetailAndroid")}
          </Text>
        </View>
        <Button label={t("getApp.get")} accessibilityHint={t("getApp.getLabel")} size="sm" block={false} onPress={() => openInNewTab(target)} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardSpot: { position: "absolute", bottom: LAYOUT.inset, end: LAYOUT.inset, width: CARD.width },
  card: { padding: CARD.pad, borderRadius: CARD.radius, gap: SPACE.md - SPACE.xxs },
  plate: { width: CARD.plate, height: CARD.plate, borderRadius: CARD.plateRadius, alignItems: "center", justifyContent: "center" },
  cardWords: { gap: SPACE.xxs },
  close: {
    position: "absolute",
    top: CLOSE_OFFSET,
    end: CLOSE_OFFSET,
    width: CARD.close,
    height: CARD.close,
    borderRadius: CARD.close / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  stripFrame: { overflow: "hidden", justifyContent: "flex-end", borderBottomWidth: StyleSheet.hairlineWidth },
  strip: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingStart: SPACE.sm, paddingEnd: SPACE.md },
  stripClose: { width: SIZE.touch - SPACE.md, height: SIZE.touch - SPACE.md, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  stripWords: { flex: 1, minWidth: 0 },
});
