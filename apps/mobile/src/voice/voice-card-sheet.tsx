// What Kawase needs from the person while voice runs minimised (Abu, 10-16: "you can be anywhere inside the app… it
// pops up and you sign it, you don't have to go to the chat"): the newest card its tools produced since the full view was
// last up comes forward — the same card the chat and the full view draw, so a send or a swap is confirmed on it right
// here — with Later (it stays in the conversation) and a way into the full view. The page behind blurs ("no matter where
// you are, except you're in the chat") and a tap on the blur is Later; on a wide screen the card sits in the middle of
// the window, on a phone above the dock.
import { X } from "lucide-react-native";
import * as React from "react";
import { usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut, FadeOutDown, SlideInDown, ZoomIn } from "react-native-reanimated";

import { BLUR } from "@kawase/config";
import { useAndroidBlur } from "@kawase/ui-native/components/blur-target";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { useWide } from "@kawase/ui-native/lib/wide";

import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import { ELEVATION, Icon, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { useVoice, voiceStore } from "./voice-store";

const MAX_WIDTH = 460;
const MAX_HEIGHT_SHARE = 0.6;
const MARK = 22;
const HALF = 2;
const SPRING_DAMPING = 20;
const EXIT_MS = 180;
const HALF_STRENGTH = 0.5;
/** The blur behind the card: lighter than the full view's, the page stays readable through it. */
const BACKDROP = { blur: BLUR.overlay * HALF_STRENGTH, scrim: 0.35, fadeMs: 200 } as const;

export function VoiceCardSheet({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const { color, name: mode } = useTheme();
  const window = useWindowDimensions();
  const wide = useWide();
  const pathname = usePathname();
  const android = useAndroidBlur();
  const clearance = useDockClearance();
  const reduced = useReducedMotionLive();
  const unseen = useVoice((voice) => voice.unseen);
  const cards = useVoice((voice) => voice.cards);
  const id = unseen.at(-1);
  const card = id ? cards.find((entry) => entry.toolCallId === id) : undefined;
  if (!card) return null;

  const part: ToolPart = { type: `tool-${card.toolName}`, toolCallId: card.toolCallId, state: "output-available", output: card.output };
  const width = window.width;
  // In the chat the conversation is the page: nothing to blur away.
  const inChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const later = () => {
    fire("tick");
    voiceStore.markSeen(card.toolCallId);
  };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      {inChat ? null : (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(BACKDROP.fadeMs)} exiting={reduced ? undefined : FadeOut.duration(EXIT_MS)} style={StyleSheet.absoluteFill}>
          <BlurView intensity={BACKDROP.blur} tint={mode === "dark" ? "dark" : "light"} {...android} style={StyleSheet.absoluteFill} />
          <Pressable accessible={false} focusable={false} onPress={later} style={[StyleSheet.absoluteFill, { backgroundColor: color.sheetScrim, opacity: BACKDROP.scrim }]} />
        </Animated.View>
      )}
      <View pointerEvents="box-none" style={[styles.anchor, wide ? styles.centred : { bottom: clearance.dock + SPACE.md }]}>
      <Animated.View
        key={card.toolCallId}
        entering={reduced ? undefined : wide ? ZoomIn.springify().damping(SPRING_DAMPING) : SlideInDown.springify().damping(SPRING_DAMPING)}
        exiting={reduced ? undefined : FadeOutDown.duration(EXIT_MS)}
        style={[
          styles.sheet,
          ELEVATION.sheet,
          { backgroundColor: color.popover, maxWidth: Math.min(MAX_WIDTH, width - SPACE.lg * HALF), maxHeight: window.height * MAX_HEIGHT_SHARE },
        ]}
      >
        <View style={styles.head}>
          <KawaseMark size={MARK} />
          <Text style={[TYPE.label, styles.grow, { color: color.ink }]}>{t("voice.needsYou")}</Text>
          {unseen.length > 1 ? <Text style={[TYPE.micro, { color: color.text3 }]}>{t("voice.moreWaiting", { count: unseen.length - 1 })}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("voice.later")}
            hitSlop={SPACE.sm}
            onPress={later}
            style={({ pressed }) => [styles.close, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
          >
            <Icon icon={X} size={SIZE.iconSm} />
          </Pressable>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <ToolCard part={part} onToolOutput={() => undefined} />
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            fire("tick");
            onOpen();
          }}
          style={({ pressed }) => [styles.open, { backgroundColor: pressed ? color.rowPressed : color.transparent }]}
        >
          <Text style={[TYPE.label, { color: color.text2 }]}>{t("voice.openConversation")}</Text>
        </Pressable>
      </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 55 },
  anchor: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: SPACE.lg },
  centred: { top: 0, bottom: 0, justifyContent: "center" },
  sheet: { width: "100%", borderRadius: RADIUS.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  grow: { flex: 1 },
  close: { width: SIZE.touch - SPACE.md, height: SIZE.touch - SPACE.md, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm },
  open: { alignItems: "center", paddingVertical: SPACE.md },
});
