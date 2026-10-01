// The five story panels (journey 1, Codex review R10). Each answers one question with one product event, built from
// the app's own materials — the ink card, the review's row grammar, real marks — on the approved colour fields:
//   1 Request   "What do I do here?"          a typed request becoming the exact fields of a payment
//   2 Bounds    "What can it do without me?"  the daily allowance as a scope card; the seal is secondary
//   3 Practice  "Can I learn without risk?"   a labelled test-money task, and the test/real distinction
//   4 Language  "Will it understand me?"      the same request in three languages meaning one thing
//   5 First     "What do I try first?"        the real first task, which the footer's Start begins
// Amounts are labelled examples on Arc Testnet, never a finished transaction. Only the visible panel moves (its
// objects float; panel 1's fields arrive after the request), and with reduced motion every panel still shows its
// whole event. Shared by the real story (copy from the catalogs) and the direction board.
import { ArrowDown, Check, ChevronDown, Globe, ScanFace, Send, ShieldX } from "lucide-react-native";
import * as React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { Float } from "@kawase/ui-native/components/art/float";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { Mark } from "@kawase/ui-native/components/mark";
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
const CARD_MAX = 320;
/** Panel 1: the fields arrive this long after the request, so the change reads as cause and effect. */
const FIELDS_DELAY_MS = MOTION.storyPanelMs;
const FIELDS_MS = MOTION.storyPanelMs;
/** The orb sits inside its ink disc with a rim. */
const ORB_INNER = 44;
/** The panels, in order, for "only the visible one moves". */
const PANEL = { request: 0, bounds: 1, practice: 2, language: 3, first: 4 } as const;
const ADDRESS_STYLE = { writingDirection: "ltr", textAlign: "left" } as const;

export type StoryCopy = {
  panels: readonly { title: string; body: string }[];
  /** "Example" — every amount on the story is one. */
  example: string;
  /** The example request in the person's language, and the same request in two other languages. */
  request: string;
  otherRequests: readonly string[];
  fields: { amount: string; to: string; network: string };
  /** "Typing works now · voice is coming" — the truth about panel 1's orb. */
  typingNow: string;
  amount: string;
  recipient: string;
  arc: string;
  arcTestnet: string;
  allowance: { amount: string; perDay: string; inside: string; above: string; never: string };
  practice: { faucetLine: string; faucetAmount: string; testMoney: string; realMoney: string };
  sameMeaning: string;
  first: { step1: string; step2: string };
};

export type StoryMotion = {
  /** The panel on screen: only its objects move and its event plays. */
  active: number;
  /** False with reduced motion, or while the story is covered or in the background. */
  animate: boolean;
};

/** A slow float when its panel is on screen, a still object otherwise (same place either way). */
function Drift({ on, style, phase = 0, children }: { on: boolean; style?: ViewStyle; phase?: number; children: React.ReactNode }) {
  return on ? (
    <Float amplitude={6} tilt={2} phase={phase} {...(style ? { style } : {})}>
      {children}
    </Float>
  ) : (
    <View style={style}>{children}</View>
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
        <Text className={cn("text-base font-semibold", mono ? "font-mono" : "")} style={[{ color: DARK.foreground }, mono ? ADDRESS_STYLE : null]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** A request as the person types it: an ink bubble at the trailing side, like their own chat message. */
function RequestBubble({ text, soft }: { text: string; soft?: boolean }) {
  return (
    <View className="max-w-full self-end rounded-3xl rounded-ee-md px-4 py-2.5" style={{ backgroundColor: soft ? SOFT_INK : STORY_INK }}>
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
  const [request, bounds, practice, language, first] = copy.panels;
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
        <View className="flex-1 justify-center gap-2.5 px-6 pt-10">
          <View className="flex-row items-center gap-3">
            <Drift on={on(PANEL.request)} phase={0.3}>
              <View className="items-center justify-center rounded-full" style={{ width: ORB_SIZE, height: ORB_SIZE, backgroundColor: STORY_INK }}>
                <View style={{ width: ORB_INNER, height: ORB_INNER }}>
                  <Orb colors={tokens.orb.testnet} level={ORB_LEVEL} />
                </View>
              </View>
            </Drift>
            <Text className={cn("flex-1 text-xs font-semibold", TEXT_START)} style={{ color: STORY_INK }}>
              {copy.typingNow}
            </Text>
          </View>
          <RequestBubble text={copy.request} />
          <Animated.View
            key={on(PANEL.request) ? "playing" : "still"}
            entering={on(PANEL.request) ? FadeInDown.delay(FIELDS_DELAY_MS).duration(FIELDS_MS) : undefined}
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
        </View>
      ),
    },
    {
      key: "bounds",
      field: FIELDS.ice,
      title: bounds?.title ?? "",
      body: bounds?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center px-6 pt-8">
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
          <Drift on={on(PANEL.bounds)} phase={0.6} style={{ position: "absolute", bottom: 18, end: 18 }}>
            <Hanko size={HANKO_SIZE} id="story-hanko" />
          </Drift>
        </View>
      ),
    },
    {
      key: "practice",
      field: FIELDS.mint,
      title: practice?.title ?? "",
      body: practice?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center gap-4 px-6 pt-8">
          <Drift on={on(PANEL.practice)} phase={0.2} style={{ width: "100%", alignItems: "center" }}>
            <InkCard>
              <View className="self-start rounded-full px-3 py-1" style={{ backgroundColor: TESTNET_DARK["network-surface"] }}>
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
            <View className="flex-row items-center gap-2 self-start rounded-full py-2 pe-4 ps-2" style={{ backgroundColor: STORY_INK }}>
              <Mark entity={test.chain} size={MARK_SMALL} />
              <Text className="text-sm font-semibold" style={{ color: TESTNET_DARK.network }}>
                {`${copy.arcTestnet} · ${copy.practice.testMoney}`}
              </Text>
            </View>
            <View className="flex-row items-center gap-2 self-start rounded-full py-2 pe-4 ps-2" style={{ backgroundColor: CHIP_TINT }}>
              <Mark entity={real.chain} size={MARK_SMALL} />
              <Text className="text-sm font-semibold" style={{ color: STORY_INK }}>
                {`${copy.arc} · ${copy.practice.realMoney}`}
              </Text>
            </View>
          </View>
        </View>
      ),
    },
    {
      key: "language",
      field: FIELDS.coral,
      title: language?.title ?? "",
      body: language?.body ?? "",
      art: (
        <View className="flex-1 justify-center gap-2.5 px-6 pt-10">
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
                  <Text className="font-mono text-base font-semibold" style={[{ color: DARK.foreground }, ADDRESS_STYLE]}>
                    {`${copy.amount} → ${copy.recipient}`}
                  </Text>
                </View>
              </InkCard>
            </Drift>
          </View>
        </View>
      ),
    },
    {
      key: "first",
      field: FIELDS.periwinkle,
      title: first?.title ?? "",
      body: first?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center px-6 pt-8">
          <InkCard>
            <CardEyebrow>{copy.arcTestnet}</CardEyebrow>
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center rounded-full" style={{ width: MARK, height: MARK, backgroundColor: DARK.foreground }}>
                <Text className="text-sm font-bold" style={{ color: STORY_INK }}>
                  1
                </Text>
              </View>
              <Text className={cn("flex-1 text-base font-semibold", TEXT_START)} style={{ color: DARK.foreground }}>
                {copy.first.step1}
              </Text>
              <Mark entity="provider:circle" size={MARK_SMALL} disc />
            </View>
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center rounded-full" style={{ width: MARK, height: MARK, backgroundColor: DARK.secondary }}>
                <Text className="text-sm font-bold" style={{ color: DARK.foreground }}>
                  2
                </Text>
              </View>
              <Text className={cn("flex-1 text-base font-semibold", TEXT_START)} style={{ color: DARK.foreground }}>
                {copy.first.step2}
              </Text>
              <Icon as={Send} className="size-4" color={DARK["muted-foreground"]} />
            </View>
          </InkCard>
          <Drift on={on(PANEL.first)} phase={0.25} style={{ position: "absolute", bottom: 14, start: 18 }}>
            <PaperPlane width={PLANE_WIDTH} id="story-plane" />
          </Drift>
        </View>
      ),
    },
  ];
}

/** The language pill on the story's canvas: ink on the colour field, the current language in its own script. */
export function StoryLanguagePill({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel?: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70"
      style={{ backgroundColor: CHIP_TINT }}
    >
      <Icon as={Globe} className="size-4" color={STORY_INK} />
      <Text className="text-sm font-semibold" style={{ color: STORY_INK }}>
        {label}
      </Text>
      <Icon as={ChevronDown} className="size-4" color={STORY_INK} />
    </Pressable>
  );
}
