// The five story panels (journey 1, Codex review R10). Each answers one question with one product event, built from
// the app's own materials — the ink card, the review's row grammar, real marks — on the approved colour fields:
//   1 Request   "What do I do here?"          a typed request becoming the exact fields of a payment
//   2 Bounds    "What can it do without me?"  the daily allowance as a scope card; the seal is secondary
//   3 Practice  "Can I learn without risk?"   a labelled test-money task, and the test/real distinction
//   4 Language  "Will it understand me?"      the same request in three languages meaning one thing
//   5 Arc       "What else can it do?"         everything on Arc: buy with Apple Pay, trade long or short, earn, automate
// Amounts are labelled examples on Arc Testnet, never a finished transaction. Only the visible panel moves (its
// objects float; panel 1's fields arrive after the request), and with reduced motion every panel still shows its
// whole event. Shared by the real story (copy from the catalogs) and the direction board.
import { ArrowDown, CalendarClock, Check, ChevronDown, Globe, ScanFace, ShieldX, Volume2, VolumeOff } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { Float } from "@kawase/ui-native/components/art/float";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { PaperPlane, PLANE_VIEWBOX } from "@kawase/ui-native/components/art/paper-plane";
import { Mark } from "@kawase/ui-native/components/mark";
import { SignalBars } from "@kawase/ui-native/components/signal-bars";
import type { StoryPanel } from "@kawase/ui-native/components/story-shell";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";

export const STORY_INK = tokens.story.ink;
const FIELDS = tokens.story.fields;
const DARK = tokens.themes.dark;
const TESTNET_DARK = tokens.themes["testnet-dark"];
const CHIP_TINT = `${STORY_INK}22`;
const SOFT_INK = `${STORY_INK}B3`;
const ORB_SIZE = 56;
const ORB_LEVEL = 0.35;
const MARK = 28;
const MARK_SMALL = 22;
const HANKO_SIZE = 76;
const PLANE_WIDTH = 132;
/** The plane's height at that width (its art is 240 × 160), plus the gap it keeps from the card. */
const PLANE_HEIGHT = (PLANE_WIDTH * PLANE_VIEWBOX.height) / PLANE_VIEWBOX.width;
const CARD_MAX = 320;
/** Panel 1: the fields arrive this long after the request, so the change reads as cause and effect. */
const FIELDS_DELAY_MS = MOTION.storyPanelMs;
const FIELDS_MS = MOTION.storyPanelMs;
/** The orb sits inside its ink disc with a rim. */
const ORB_INNER = 44;
/** The panels, in order, for "only the visible one moves". */
const PANEL = { request: 0, bounds: 1, practice: 2, language: 3, everything: 4 } as const;
const ADDRESS_STYLE = { writingDirection: "ltr", textAlign: "left" } as const;
const CENTERED = { alignItems: "center", justifyContent: "center" } as const;

export type StoryCopy = {
  panels: readonly { title: string; body: string }[];
  /** "Example" — every amount on the story is one. */
  example: string;
  /** The example request in the person's language, and the same request in two other languages. */
  request: string;
  otherRequests: readonly string[];
  fields: { amount: string; to: string; network: string };
  /** "Type it or say it" — panel 1's orb: typing and voice both work. */
  typingNow: string;
  amount: string;
  recipient: string;
  arc: string;
  arcTestnet: string;
  allowance: { amount: string; perDay: string; inside: string; above: string; never: string };
  practice: { faucetLine: string; faucetAmount: string; testMoney: string; realMoney: string };
  sameMeaning: string;
  /** Panel 5, one line each with its real mark. */
  everything: { buy: string; trade: string; earn: string; automate: string };
};

export type StoryMotion = {
  /** The panel on screen: only its objects move and its event plays. */
  active: number;
  /** False with reduced motion, or while the story is covered or in the background. */
  animate: boolean;
};

/** A slow float when its panel is on screen, a still object otherwise (same place either way). */
function Drift({
  on,
  style,
  phase = 0,
  children,
}: {
  on: boolean;
  style?: ViewStyle;
  phase?: number;
  children: React.ReactNode;
}) {
  // Always the same component: toggling Float for a View would remount the art (Skia canvases, stipple SVGs)
  // every time a panel lands, which shows up as a hitch at the end of a swipe.
  return (
    <Float amplitude={6} tilt={2} phase={phase} paused={!on} {...(style ? { style } : {})}>
      {children}
    </Float>
  );
}

/** The art's room on the canvas: below the progress bar and the language pill, above the canvas edge. */
const ART_TOP = 52;
const ART_BOTTOM = 12;
const HALF = 2;

/**
 * Centres a panel's art in the room it has and, when the room is shorter than the art (a short browser window on a
 * laptop, a small phone), scales it down to fit, so it never runs under the progress bar or past the canvas edge.
 * On a phone with room to spare the scale is 1. Hidden until measured, so it never flashes at the wrong size.
 * `overlay` holds decorations positioned against the whole canvas (the seal, the plane); they are never scaled.
 */
function FitArt({
  className,
  children,
  overlay,
  overlayNeeds = 0,
}: {
  className?: string;
  children: React.ReactNode;
  overlay?: React.ReactNode;
  /** Free height the overlay needs beside the content; on a canvas without it the overlay is left out. */
  overlayNeeds?: number;
}) {
  const [room, setRoom] = React.useState(0);
  const [natural, setNatural] = React.useState(0);
  const measured = room > 0 && natural > 0;
  const scale = measured && natural > room ? room / natural : 1;
  const spare = measured ? room - natural * scale : 0;
  return (
    <View style={{ flex: 1 }} onLayout={(event) => setRoom(event.nativeEvent.layout.height - ART_TOP - ART_BOTTOM)}>
      <View
        className={className}
        onLayout={(event) => setNatural(event.nativeEvent.layout.height)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: ART_TOP,
          opacity: measured ? 1 : 0,
          transform: [{ translateY: measured ? (room - natural) / HALF : 0 }, { scale }],
        }}
      >
        {children}
      </View>
      {/* Decorations placed against the whole canvas (the seal, the plane), not against the scaled content. */}
      {overlay && spare >= overlayNeeds ? overlay : null}
    </View>
  );
}

/** The app's card material on a colour field: ink, light text. */
function InkCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View className="w-full gap-3 rounded-3xl p-4" style={[{ backgroundColor: STORY_INK, maxWidth: CARD_MAX }, style]}>
      {children}
    </View>
  );
}

function CardEyebrow({ children, color = DARK["muted-foreground"] }: { children: string; color?: string }) {
  return (
    <Text className={cn("text-xs font-semibold uppercase tracking-wide", TEXT_START)} style={{ color }}>
      {children}
    </Text>
  );
}

/** The review card's row: a muted label, then the value with its mark. */
function FieldRow({ label, value, mark, mono }: { label: string; value: string; mark?: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-sm" style={{ color: DARK["muted-foreground"] }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        {mark ? <Mark entity={mark} size={MARK_SMALL} /> : null}
        <Text
          className={cn("text-base font-semibold", mono ? "font-mono" : "")}
          style={[{ color: DARK.foreground }, mono ? ADDRESS_STYLE : null]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** A request as the person types it: an ink bubble at the trailing side, like their own chat message. */
function RequestBubble({ text, soft }: { text: string; soft?: boolean }) {
  return (
    <View
      className="max-w-full self-end rounded-3xl rounded-ee-md px-4 py-2.5"
      style={{ backgroundColor: soft ? SOFT_INK : STORY_INK }}
    >
      <Text className={cn("font-semibold", soft ? "text-sm" : "text-base")} style={{ color: DARK.foreground }}>
        {text}
      </Text>
    </View>
  );
}

function ListLine({ icon, text, tone = DARK.foreground }: { icon: typeof Check; text: string; tone?: string }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <Icon as={icon} className="mt-0.5 size-4" color={tone} />
      <Text className={cn("flex-1 text-sm leading-5", TEXT_START)} style={{ color: DARK.foreground }}>
        {text}
      </Text>
    </View>
  );
}

export function storyPanels(copy: StoryCopy, motion: StoryMotion): StoryPanel[] {
  const [request, bounds, practice, language, everything] = copy.panels;
  const test = arcIdentity("testnet");
  const real = arcIdentity("mainnet");
  const on = (i: number) => motion.animate && motion.active === i;
  const exampleLine = `${copy.example} · ${copy.arcTestnet}`;

  return [
    {
      key: "request",
      field: FIELDS.lime,
      title: request?.title ?? "",
      body: request?.body ?? "",
      art: (
        <FitArt className="gap-2.5 px-6">
          <View className="flex-row items-center gap-3">
            <Drift on={on(PANEL.request)} phase={0.3}>
              <View
                className="items-center justify-center rounded-full"
                style={{ width: ORB_SIZE, height: ORB_SIZE, backgroundColor: STORY_INK }}
              >
                <View style={{ width: ORB_INNER, height: ORB_INNER }}>
                  <Orb colors={tokens.orb.testnet} level={ORB_LEVEL} paused={!on(PANEL.request)} />
                </View>
              </View>
            </Drift>
            <Text className={cn("flex-1 text-xs font-semibold", TEXT_START)} style={{ color: STORY_INK }}>
              {copy.typingNow}
            </Text>
          </View>
          <RequestBubble text={copy.request} />
          <Animated.View
            entering={motion.animate ? FadeInDown.delay(FIELDS_DELAY_MS).duration(FIELDS_MS) : undefined}
            className="items-center gap-2"
          >
            <Icon as={ArrowDown} className="size-5" color={STORY_INK} />
            <InkCard>
              <CardEyebrow>{exampleLine}</CardEyebrow>
              <FieldRow label={copy.fields.amount} value={copy.amount} mark={test.usdc} />
              <FieldRow label={copy.fields.to} value={copy.recipient} mono />
              <FieldRow label={copy.fields.network} value={copy.arcTestnet} mark={test.chain} />
            </InkCard>
          </Animated.View>
        </FitArt>
      ),
    },
    {
      key: "bounds",
      field: FIELDS.ice,
      title: bounds?.title ?? "",
      body: bounds?.body ?? "",
      art: (
        <FitArt
          className="items-center px-6"
          overlay={
            <Drift on={on(PANEL.bounds)} phase={0.6} style={{ position: "absolute", bottom: 18, end: 18 }}>
              <Hanko size={HANKO_SIZE} id="story-hanko" />
            </Drift>
          }
        >
          <InkCard>
            <CardEyebrow>{exampleLine}</CardEyebrow>
            <View className="flex-row items-center gap-2.5">
              <Mark entity={test.usdc} chainBadge={test.chain} size={MARK} />
              <Text className="font-display text-3xl font-bold" style={{ color: DARK.foreground }}>
                {copy.allowance.amount}
              </Text>
              <Text className="text-base" style={{ color: DARK["muted-foreground"] }}>
                {copy.allowance.perDay}
              </Text>
            </View>
            <View className="gap-2">
              <ListLine icon={Check} text={copy.allowance.inside} tone={DARK.success} />
              <ListLine icon={ScanFace} text={copy.allowance.above} tone={DARK.primary} />
              <ListLine icon={ShieldX} text={copy.allowance.never} tone={DARK["muted-foreground"]} />
            </View>
          </InkCard>
        </FitArt>
      ),
    },
    {
      key: "practice",
      field: FIELDS.mint,
      title: practice?.title ?? "",
      body: practice?.body ?? "",
      art: (
        <FitArt className="items-center gap-4 px-6">
          <Drift on={on(PANEL.practice)} phase={0.2} style={{ width: "100%", alignItems: "center" }}>
            <InkCard>
              <View
                className="self-start rounded-full px-3 py-1"
                style={{ backgroundColor: TESTNET_DARK["network-surface"] }}
              >
                <Text className="text-xs font-semibold" style={{ color: TESTNET_DARK.network }}>
                  {copy.example}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Mark entity="provider:circle" size={MARK} disc />
                <Text className={cn("flex-1 text-base font-semibold", TEXT_START)} style={{ color: DARK.foreground }}>
                  {copy.practice.faucetLine}
                </Text>
                <Text className="font-mono text-base font-semibold" style={{ color: DARK.success }}>
                  {copy.practice.faucetAmount}
                </Text>
              </View>
            </InkCard>
          </Drift>
          {/* The two networks side by side: practice is chosen, real money is one tap away and always labelled. */}
          <View className="w-full gap-2" style={{ maxWidth: CARD_MAX }}>
            <View
              className="flex-row items-center gap-2 self-start rounded-full py-2 pe-4 ps-2"
              style={{ backgroundColor: STORY_INK }}
            >
              <Mark entity={test.chain} size={MARK_SMALL} />
              <Text className="text-sm font-semibold" style={{ color: TESTNET_DARK.network }}>
                {`${copy.arcTestnet} · ${copy.practice.testMoney}`}
              </Text>
            </View>
            <View
              className="flex-row items-center gap-2 self-start rounded-full py-2 pe-4 ps-2"
              style={{ backgroundColor: CHIP_TINT }}
            >
              <Mark entity={real.chain} size={MARK_SMALL} />
              <Text className="text-sm font-semibold" style={{ color: STORY_INK }}>
                {`${copy.arc} · ${copy.practice.realMoney}`}
              </Text>
            </View>
          </View>
        </FitArt>
      ),
    },
    {
      key: "language",
      field: FIELDS.coral,
      title: language?.title ?? "",
      body: language?.body ?? "",
      art: (
        <FitArt className="gap-2.5 px-6">
          {copy.otherRequests.map((other) => (
            <RequestBubble key={other} text={other} soft />
          ))}
          <RequestBubble text={copy.request} />
          <View className="items-center gap-2 pt-1">
            <Icon as={ArrowDown} className="size-5" color={STORY_INK} />
            <Drift on={on(PANEL.language)} phase={0.5} style={{ width: "100%", alignItems: "center" }}>
              <InkCard>
                <CardEyebrow>{copy.sameMeaning}</CardEyebrow>
                <View className="flex-row items-center gap-2">
                  <Mark entity={test.usdc} size={MARK_SMALL} />
                  <Text
                    className="font-mono text-base font-semibold"
                    style={[{ color: DARK.foreground }, ADDRESS_STYLE]}
                  >
                    {`${copy.amount} → ${copy.recipient}`}
                  </Text>
                </View>
              </InkCard>
            </Drift>
          </View>
        </FitArt>
      ),
    },
    {
      key: "everything",
      field: FIELDS.periwinkle,
      title: everything?.title ?? "",
      body: everything?.body ?? "",
      art: (
        <FitArt
          className="items-center px-6"
          overlayNeeds={PLANE_HEIGHT}
          overlay={
            <Drift on={on(PANEL.everything)} phase={0.25} style={{ position: "absolute", bottom: 14, start: 18 }}>
              <PaperPlane width={PLANE_WIDTH} id="story-plane" />
            </Drift>
          }
        >
          <InkCard>
            <CardEyebrow>{copy.arc}</CardEyebrow>
            {[
              { key: "buy", text: copy.everything.buy, mark: <Mark entity="provider:apple" size={MARK_SMALL} variant="mono" tint={DARK.foreground} /> },
              { key: "trade", text: copy.everything.trade, mark: <Mark entity="provider:aave" size={MARK_SMALL} /> },
              { key: "earn", text: copy.everything.earn, mark: <Mark entity="provider:morpho" size={MARK_SMALL} /> },
              { key: "automate", text: copy.everything.automate, mark: <Icon as={CalendarClock} className="size-5" color={DARK.foreground} /> },
            ].map((row) => (
              <View key={row.key} className="flex-row items-center gap-3">
                <View className="items-center justify-center rounded-full" style={{ width: MARK, height: MARK, backgroundColor: DARK.secondary }}>
                  {row.mark}
                </View>
                <Text className={cn("flex-1 text-base font-semibold", TEXT_START)} style={{ color: DARK.foreground }}>
                  {row.text}
                </Text>
              </View>
            ))}
          </InkCard>
        </FitArt>
      ),
    },
  ];
}

/** The language pill on the story's canvas: ink on the colour field, the current language in its own script. */
export function StoryLanguagePill({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      className="shrink flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70"
      style={{ backgroundColor: CHIP_TINT }}
    >
      <Icon as={Globe} className="size-4" color={STORY_INK} />
      <Text numberOfLines={1} className="shrink text-sm font-semibold" style={{ color: STORY_INK }}>
        {label}
      </Text>
      <Icon as={ChevronDown} className="size-4" color={STORY_INK} />
    </Pressable>
  );
}

/**
 * The narration switch beside the language pill (plan §1.5), after 21st.dev 29845 Mute Toggle Button · sean0205: a
 * pressed-state toggle that swaps a speaker for a muted speaker. Ours is a round chip in the pill's tint; while a
 * clip is speaking the speaker turns into pulsing bars (21st.dev 24461 Signal Bars Loader · elements-), driven by
 * `level` on the UI thread so a swipe that cuts the clip never re-renders the story.
 */
export function StoryNarrationButton({
  on,
  level,
  label,
  onPress,
}: {
  on: boolean;
  level: SharedValue<number>;
  label: string;
  onPress: () => void;
}) {
  const speaker = useAnimatedStyle(() => ({ opacity: 1 - level.value }));
  const bars = useAnimatedStyle(() => ({ opacity: level.value }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      hitSlop={8}
      className="size-8 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: CHIP_TINT }}
    >
      {on ? (
        <>
          <Animated.View style={speaker}>
            <Icon as={Volume2} className="size-4" color={STORY_INK} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, CENTERED, bars]}>
            <SignalBars color={STORY_INK} level={level} />
          </Animated.View>
        </>
      ) : (
        <Icon as={VolumeOff} className="size-4" color={STORY_INK} />
      )}
    </Pressable>
  );
}
