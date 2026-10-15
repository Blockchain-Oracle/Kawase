// The island (Abu, 10-16: "like the Dynamic Island… if you click on it again, it widens up"): while a voice
// conversation runs minimised, one black pill sits at the top of whatever page is open — the live orb, what Kawase is
// doing and its latest words, a mark when a card is waiting, mute and end. Tapping it brings the full view back. Black in
// both themes like the hardware island it borrows from; over the page, never in its layout.
import { Mic, MicOff, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeOut, LinearTransition, ZoomIn, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "@kawase/ui-tokens";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
import { useWide } from "@kawase/ui-native/lib/wide";

import { ELEVATION, Icon, SPACE, TYPE } from "@/components/kit";
import { Orb } from "@/components/orb";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useTheme } from "@/theme/theme-provider";

import { useVoice, voiceStore, type VoicePhase } from "./voice-store";

const ISLAND = { height: 52, orb: 34, button: 36, maxWidth: 420 } as const;
const INK = "#000000";
const WHITE = "#FFFFFF";
const QUIET = "#9A9A9A";
const MAGENTA = tokens.themes.dark.accent;
const END = "#E5484D";
const HALF = 2;
const GUTTER = SPACE.lg;
/** The pill springs in and settles as its words change length. */
const MOTION_IN = { damping: 18, exitMs: 160, layoutDamping: 20 } as const;

const PHASE_KEY: Record<VoicePhase, string> = {
  connecting: "voice.connecting",
  listening: "voice.listening",
  thinking: "voice.thinking",
  speaking: "voice.speaking",
  muted: "voice.muted",
  failed: "voice.failed",
};

export function VoiceIsland({ level, onOpen, onEnd }: { level: SharedValue<number>; onOpen: () => void; onEnd: () => void }) {
  const { t } = useT();
  const { network } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = useWide();
  const stage = useStageFrame();
  const reduced = useReducedMotionLive();
  const phase = useVoice((voice) => voice.phase);
  const caption = useVoice((voice) => voice.caption);
  const muted = useVoice((voice) => voice.muted);
  const waiting = useVoice((voice) => voice.unseen.length);
  const label = t(PHASE_KEY[phase]);

  // Over the page the person is on: the content beside the sidebar on a desktop, the screen under the status bar on a phone.
  const left = wide && stage ? stage.x : 0;
  const width = wide && stage ? stage.width : window.width;
  const top = wide ? SPACE.md : insets.top + SPACE.xs;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { top, left, width }]}>
      <Animated.View
        entering={reduced ? undefined : ZoomIn.springify().damping(MOTION_IN.damping)}
        exiting={reduced ? undefined : FadeOut.duration(MOTION_IN.exitMs)}
        layout={reduced ? undefined : LinearTransition.springify().damping(MOTION_IN.layoutDamping)}
        style={[styles.pill, ELEVATION.dock, { maxWidth: Math.min(ISLAND.maxWidth, width - GUTTER * HALF) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}. ${caption}`}
          accessibilityHint={t("voice.islandHint")}
          onPress={() => {
            fire("tick");
            onOpen();
          }}
          style={styles.open}
        >
          <View style={styles.orb}>
            <Orb colors={tokens.orb[network]} level={level} className="size-full" />
          </View>
          <View style={styles.words}>
            <Text numberOfLines={1} style={[TYPE.micro, { color: phase === "speaking" ? MAGENTA : QUIET }]}>
              {waiting > 0 ? t("voice.needsYou") : label}
            </Text>
            {caption ? (
              <Text numberOfLines={1} style={[TYPE.label, { color: WHITE }]}>
                {caption}
              </Text>
            ) : null}
          </View>
          {waiting > 0 ? (
            <View style={styles.badge}>
              <Text style={[TYPE.micro, { color: WHITE }]}>{waiting}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? t("voice.unmute") : t("voice.mute")}
          accessibilityState={{ selected: muted }}
          onPress={() => {
            fire("tick");
            voiceStore.toggleMute();
          }}
          style={[styles.button, { backgroundColor: muted ? WHITE : "#1F1F1F" }]}
        >
          <Icon icon={muted ? MicOff : Mic} size={16} tint={muted ? INK : WHITE} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("voice.end")}
          onPress={() => {
            fire("press");
            onEnd();
          }}
          style={[styles.button, { backgroundColor: END }]}
        >
          <Icon icon={X} size={16} tint={WHITE} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", alignItems: "center", zIndex: 60 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    height: ISLAND.height,
    paddingStart: SPACE.xs + SPACE.xxs,
    paddingEnd: SPACE.xs + SPACE.xxs,
    borderRadius: ISLAND.height,
    backgroundColor: INK,
  },
  open: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, flexShrink: 1, minWidth: 0 },
  orb: { width: ISLAND.orb, height: ISLAND.orb },
  words: { flexShrink: 1, minWidth: 0, paddingEnd: SPACE.xs },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: SPACE.xs, alignItems: "center", justifyContent: "center", backgroundColor: MAGENTA },
  button: { width: ISLAND.button, height: ISLAND.button, borderRadius: ISLAND.button, alignItems: "center", justifyContent: "center" },
});
