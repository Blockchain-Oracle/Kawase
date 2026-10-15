// What Kawase needs from the person while voice runs minimised (Abu, 10-16: "you can be anywhere inside the app… it
// pops up and you sign it, you don't have to go to the chat"): the newest card its tools produced since the full view was
// last up rises over the page above the dock — the same card the chat and the full view draw, so a send or a swap is
// confirmed on it right here — with Later (it stays in the conversation) and a way into the full view.
import { X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeOutDown, SlideInDown } from "react-native-reanimated";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
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

export function VoiceCardSheet({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const window = useWindowDimensions();
  const wide = useWide();
  const stage = useStageFrame();
  const clearance = useDockClearance();
  const reduced = useReducedMotionLive();
  const unseen = useVoice((voice) => voice.unseen);
  const cards = useVoice((voice) => voice.cards);
  const id = unseen.at(-1);
  const card = id ? cards.find((entry) => entry.toolCallId === id) : undefined;
  if (!card) return null;

  const part: ToolPart = { type: `tool-${card.toolName}`, toolCallId: card.toolCallId, state: "output-available", output: card.output };
  const left = wide && stage ? stage.x : 0;
  const width = wide && stage ? stage.width : window.width;
  const bottom = wide ? SPACE.xl : clearance.dock + SPACE.md;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { left, width, bottom }]}>
      <Animated.View
        key={card.toolCallId}
        entering={reduced ? undefined : SlideInDown.springify().damping(SPRING_DAMPING)}
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
            onPress={() => {
              fire("tick");
              voiceStore.markSeen(card.toolCallId);
            }}
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
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", alignItems: "center", zIndex: 55, paddingHorizontal: SPACE.lg },
  sheet: { width: "100%", borderRadius: RADIUS.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  grow: { flex: 1 },
  close: { width: SIZE.touch - SPACE.md, height: SIZE.touch - SPACE.md, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm },
  open: { alignItems: "center", paddingVertical: SPACE.md },
});
