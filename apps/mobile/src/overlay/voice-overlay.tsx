// The voice overlay (Phantom M06's blur grammar, Koe's rules): the live page blurs and darkens, the orb rises
// from its slot in the dock to the centre and grows, the state and the words come forward. A voice conversation runs
// under it (Stage 10, `voice/voice-session`): the orb follows the voices, Kawase's words are shown, and the cards its
// tools produce appear under them. Typing is always one tap away and continues the same thread (K4 / U1). Instant
// with reduced motion.
//
// The conversation outlives this view (Abu, 10-16: "the agent should keep running in the background"): the chevron,
// Escape, Back or a tap on any empty space minimise it to the island (Dynamic Island's grammar: a black pill with the live
// orb and Kawase's words, tap to open it again) — a tap on a card, a button or the slide never does — and the card sheet
// brings anything Kawase needs to whatever page is open. Neon says voice is on, inside the app where Kawase is talking
// (Abu, 10-16: "not outside of the app"): round the conversation here, round the island and the page when minimised,
// breathing with Kawase's voice and under every card. Only End ends it.
//
// One orb at a time (Codex review R16): the travel is measured — the dock's orb slot and the orb's place in the
// column, both in window coordinates — not assumed from the screen's midpoint; the dock's orb steps aside while this
// one is up, and this one stays sharp on its way home (only the words fade), handing back when it lands. To
// assistive tech (R13) the overlay is the only surface: focus moves to its heading and, unless "Type instead" took
// the person to the chat, back to the dock's orb when it closes.
import { MOTION } from "@kawase/config";
import { useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { focusElement, useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
import { useWide } from "@kawase/ui-native/lib/wide";
import { tokens } from "@kawase/ui-tokens";

import { Icon, SIZE, SPACE, TYPE, useTheme as useKitTheme } from "@/components/kit";
import { Orb } from "@/components/orb";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { NEON_WEIGHT } from "@/voice/neon-shared";
import { NeonRing } from "@/voice/neon-ring";
import { VoiceCardSheet } from "@/voice/voice-card-sheet";
import { VoiceIsland } from "@/voice/voice-island";
import { useVoice } from "@/voice/voice-store";

// LiveKit (the room, its React hooks, WebRTC) is about 1.6 MB of script: it loads when voice mode first opens, not
// with the app (the web's first paint waited on it).
const VoiceSession = React.lazy(() =>
  import("@/voice/voice-session").then((module) => ({ default: module.VoiceSession })),
);

export const ORB_DOCK_SIZE = 40;
/** The orb in the overlay: the screen's one figure (ChatGPT's voice mode), about two thirds of a phone's width. */
const ORB_MAX = 300;
const ORB_WIDTH_SHARE = 0.68;
const ORB_HEIGHT_SHARE = 0.36;
const IDLE_LEVEL = 0.2;
const HALF = 0.5;
const TOP_GAP = 56;
const BOTTOM_GAP = 16;
/** The neon round the conversation: its share of a wide window (centred on the orb), and its corners. */
const FRAME = { share: 0.78, min: 720, radius: 32, phoneRadius: 40, pageWeight: 0.55 } as const;
const TWICE = 2;

type Point = { x: number; y: number };

/** A view's centre in window coordinates (undefined when it is not on screen). */
function measureCentre(node: View | null, done: (centre: Point | undefined) => void) {
  if (!node) return done(undefined);
  node.measureInWindow((x, y, width, height) =>
    done(width > 0 ? { x: x + width * HALF, y: y + height * HALF } : undefined),
  );
}

function RisingOrb({
  progress,
  from,
  network,
  level,
  size,
}: {
  progress: SharedValue<number>;
  from: SharedValue<Point | null>;
  network: "mainnet" | "testnet";
  level: SharedValue<number>;
  size: number;
}) {
  const startScale = ORB_DOCK_SIZE / size;
  // Invisible until both ends are measured, so it never flashes at the centre first.
  const style = useAnimatedStyle(() => {
    const origin = from.value;
    const away = 1 - progress.value;
    return {
      opacity: origin ? 1 : 0,
      transform: [
        { translateX: (origin?.x ?? 0) * away },
        { translateY: (origin?.y ?? 0) * away },
        { scale: startScale + (1 - startScale) * progress.value },
      ],
    };
  });
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Orb colors={tokens.orb[network]} level={level} className="size-full" />
    </Animated.View>
  );
}

type VoiceStageProps = {
  open: boolean;
  level: SharedValue<number>;
  children: React.ReactNode;
  /** The person left voice for the keyboard: focus does not go back to the dock's orb. */
  leavingForChat: React.RefObject<boolean>;
};

/** The full view: the blur, the orb rising from the dock, and what the conversation shows under it. */
function VoiceStage({ open, level, children, leavingForChat }: VoiceStageProps) {
  const { t } = useT();
  const overlay = useOverlay();
  const { mode, network } = useTheme();
  const colors = useThemeColors();
  const kit = useKitTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const orbSize = Math.round(Math.min(ORB_MAX, window.width * ORB_WIDTH_SHARE, window.height * ORB_HEIGHT_SHARE));
  const reduced = useReducedMotionLive();
  const progress = useSharedValue(0);
  const from = useSharedValue<Point | null>(null);
  const slot = React.useRef<View>(null);
  const heading = React.useRef<View>(null);
  const trigger = overlay.voiceTrigger;
  const wide = useWide();
  const phase = useVoice((voice) => voice.phase);
  // Round the conversation, inside the window: centred on the orb on a wide screen, just inside the screen on a phone.
  const frameWidth = wide ? Math.min(window.width - SPACE.xl * TWICE, Math.max(FRAME.min, window.width * FRAME.share)) : window.width - SPACE.sm * TWICE;
  const frameTop = insets.top + (wide ? SPACE.md : SPACE.xs);
  const frame = {
    left: (window.width - frameWidth) / TWICE,
    top: frameTop,
    width: frameWidth,
    height: window.height - frameTop - insets.bottom - (wide ? SPACE.md : SPACE.xs),
  };

  React.useEffect(() => {
    if (!open) {
      progress.value = withTiming(0, { duration: reduced ? 0 : MOTION.blurOutMs, easing: Easing.in(Easing.cubic) });
      return;
    }
    leavingForChat.current = false;
    // Both ends measured after the overlay has laid out: from the dock's orb to the orb's place in the column.
    const frame = requestAnimationFrame(() =>
      measureCentre(slot.current, (to) =>
        measureCentre(trigger.current, (origin) => {
          from.value = to && origin ? { x: origin.x - to.x, y: origin.y - to.y } : { x: 0, y: 0 };
          progress.value = withTiming(1, {
            duration: reduced ? 0 : MOTION.orbRiseMs,
            easing: Easing.out(Easing.cubic),
          });
        }),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, reduced, progress, from, trigger, leavingForChat]);

  const words = useAnimatedStyle(() => ({ opacity: progress.value }));

  const exited = () => {
    from.value = null;
    overlay.exited("voice");
    if (!leavingForChat.current) focusElement(trigger.current);
  };

  return (
    <BlurOverlay
      open={open}
      onClose={overlay.close}
      scheme={mode}
      scrim={colors.scrim}
      closeLabel={t("voice.minimize")}
      close="none"
      topInset={insets.top}
      initialFocusRef={heading}
      contentFades={false}
      onExited={exited}
    >
      {/* Under everything in the view: the cards and the dock sit on top of it. */}
      <NeonRing intensity={NEON_WEIGHT[phase]} level={level} radius={wide ? FRAME.radius : FRAME.phoneRadius} style={frame} />
      {/* Down to the island: the conversation keeps going while the person uses the app. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("voice.minimize")}
        hitSlop={SPACE.sm}
        onPress={overlay.close}
        style={({ pressed }) => [styles.minimize, { top: insets.top + SPACE.md, backgroundColor: pressed ? kit.color.rowPressed : kit.color.raised2 }]}
      >
        <Icon icon={ChevronDown} size={SIZE.iconSm + SPACE.xxs} />
      </Pressable>
      {/* Empty space lets a tap through to the backdrop under it (BlurOverlay's tap-outside, here: minimise). */}
      <View
        pointerEvents="box-none"
        className="flex-1 items-center gap-6 px-6"
        style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom + BOTTOM_GAP }}
      >
        <View
          ref={heading}
          accessible
          accessibilityRole="header"
          accessibilityLabel={t("voice.title")}
          tabIndex={Platform.OS === "web" ? -1 : undefined}
        >
          <View ref={slot} style={{ width: orbSize, height: orbSize }}>
            <RisingOrb progress={progress} from={from} network={network} level={level} size={orbSize} />
          </View>
        </View>
        <Animated.View pointerEvents="box-none" style={words} className="w-full flex-1 items-center">
          {open ? children : null}
        </Animated.View>
      </View>
    </BlurOverlay>
  );
}

/**
 * Voice, as long as a conversation runs: the room (and its engine) under the full view when it is up, the island and
 * the card sheet when it is not, and the edge glow around everything. Rendered once where the overlays live (the
 * desktop host, the phone's signed-in layout).
 */
export function VoiceLayer() {
  const router = useRouter();
  const overlay = useOverlay();
  const level = useSharedValue(IDLE_LEVEL);
  const leavingForChat = React.useRef(false);
  const full = overlay.current === "voice";
  const live = overlay.voiceLive;

  const typeInstead = (threadId: string | undefined) => {
    leavingForChat.current = true;
    overlay.endVoice();
    router.navigate(threadId ? { pathname: "/chat", params: { thread: threadId } } : "/chat");
  };
  const stage = (content: React.ReactNode) => (
    <VoiceStage open={full} level={level} leavingForChat={leavingForChat}>
      {content}
    </VoiceStage>
  );

  return (
    <>
      {live ? (
        <React.Suspense fallback={stage(<StateLine labelKey="voice.connecting" />)}>
          <VoiceSession level={level} full={full} stage={stage} onTypeInstead={typeInstead} onEnd={overlay.endVoice} />
        </React.Suspense>
      ) : null}
      {live && !full ? <PageNeon level={level} /> : null}
      {live && !full ? <VoiceIsland level={level} onOpen={() => overlay.open("voice")} onEnd={overlay.endVoice} /> : null}
      {live && !full ? <VoiceCardSheet onOpen={() => overlay.open("voice")} /> : null}
    </>
  );
}

/** Minimised: a quieter neon just inside the page Kawase is listening on (the content beside the sidebar on a desktop). */
function PageNeon({ level }: { level: SharedValue<number> }) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const stage = useStageFrame();
  const phase = useVoice((voice) => voice.phase);
  const left = wide && stage ? stage.x + SPACE.xs : SPACE.xs;
  const width = wide && stage ? stage.width - SPACE.xs * TWICE : window.width - SPACE.xs * TWICE;
  const top = wide ? SPACE.xs : insets.top ? SPACE.xs : SPACE.xxs;
  return (
    <NeonRing
      intensity={NEON_WEIGHT[phase] * FRAME.pageWeight}
      level={level}
      radius={wide ? FRAME.radius : FRAME.phoneRadius}
      style={[styles.page, { left, top, width, height: window.height - top * TWICE }]}
    />
  );
}

/** The status line while voice mode's code loads (the first time it opens). */
function StateLine({ labelKey }: { labelKey: string }) {
  const { t } = useT();
  const { color } = useKitTheme();
  return <Text style={[TYPE.label, { color: color.text2 }]}>{t(labelKey)}</Text>;
}

const MINIMIZE = SIZE.touch - SPACE.xs;
const styles = StyleSheet.create({
  page: { zIndex: 50 },
  minimize: { position: "absolute", end: SPACE.lg, zIndex: 1, width: MINIMIZE, height: MINIMIZE, borderRadius: MINIMIZE, alignItems: "center", justifyContent: "center" },
});
