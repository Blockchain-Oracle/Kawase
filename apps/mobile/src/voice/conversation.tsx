// The live conversation under the orb, the full view, the same on the phone and on the web (ChatGPT's voice mode and
// Meta AI's call dock, Refero flows 7030 / 12673): a status line, the person's words small and Kawase's answer large as
// live captions, Kawase's cards rising under its words as its tools produce them (one scrolling column, so a tall card
// never squeezes the answer out) — a send to confirm is confirmed on its card, never by a spoken "yes" — and one dock
// of round controls at the foot: type, mute, stop, end. No "Try saying" row (Abu, 10-16: talk, don't tap). What keeps
// running when this view is minimised (the orb, the cards, mute, Stop) is the engine's (voice-engine.tsx), read here
// from the voice store.
import { useLocalParticipant, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import { Keyboard, Mic, MicOff, Square, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import {
  CONTROL_FONT_SCALE,
  ELEVATION,
  FONT,
  Icon,
  LiveDot,
  RADIUS,
  SPACE,
  TYPE,
  usePressScale,
  useTheme,
} from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { LiveCaption } from "./live-caption";
import { useVoice, voiceStore } from "./voice-store";

const SEGMENT_ID = "lk.segment_id";
const HALF = 2;
const DOCK_BUTTON = 56;
const CAPTION_MAX_WIDTH = 560;
/** Kawase's answer: the screen's one large line. */
const ANSWER = { fontFamily: FONT.sans, fontSize: 24, lineHeight: 32, fontWeight: "600" } as const;

type Line = { id: string; text: string; at: number };

export function Conversation({ threadId, onTypeInstead, onEnd }: { threadId: string; onTypeInstead: (threadId: string) => void; onEnd: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const reduced = useReducedMotionLive();
  const { state, agent } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const muted = useVoice((voice) => voice.muted);
  const cards = useVoice((voice) => voice.cards);
  const [stopped, setStopped] = React.useState(false);
  const [stopFailed, setStopFailed] = React.useState(false);

  const stop = async () => {
    setStopFailed(false);
    try {
      await voiceStore.stop();
      setStopped(true);
    } catch {
      setStopFailed(true);
    }
  };
  React.useEffect(() => {
    if (state === "thinking" || state === "speaking") setStopped(false);
  }, [state]);

  // Captions: the person's latest line, and Kawase's latest line once it answers that one.
  const own = localParticipant.identity;
  let you: Line | undefined;
  let kawase: Line | undefined;
  transcriptions.forEach((entry, at) => {
    const line = { id: entry.streamInfo.attributes?.[SEGMENT_ID] ?? entry.streamInfo.id, text: entry.text, at };
    if (entry.participantInfo.identity === own) you = line;
    else if (agent && entry.participantInfo.identity === agent.identity) kawase = line;
  });
  const answer = kawase && (!you || kawase.at > you.at) ? kawase : undefined;

  const busy = state === "thinking" || state === "speaking";
  const label =
    state === "speaking"
      ? t("voice.speaking")
      : state === "thinking"
        ? t("voice.thinking")
        : muted
          ? t("voice.muted")
          : state === "listening" || state === "idle"
            ? t("voice.listening")
            : t("voice.connecting");
  const micBlocked = !muted && (state === "listening" || state === "idle") && !isMicrophoneEnabled;

  return (
    <View style={styles.root}>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {muted ? null : <LiveDot tint={busy ? color.accent : undefined} />}
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.text2 }]}>
          {label}
        </Text>
      </View>

      <ScrollView style={styles.captions} contentContainerStyle={styles.captionsBody} showsVerticalScrollIndicator={false}>
        {you?.text.trim() ? <LiveCaption id={you.id} text={you.text} textStyle={[TYPE.body, { color: color.text2 }]} /> : null}
        {answer?.text.trim() ? <LiveCaption id={answer.id} text={answer.text} textStyle={[ANSWER, { color: color.ink }]} /> : null}
        {stopped || stopFailed ? (
          <Text accessibilityRole="alert" style={[TYPE.caption, styles.center, { color: color.text2 }]}>
            {stopped ? t("chat.stopped") : t("voice.failed")}
          </Text>
        ) : null}
        {micBlocked ? (
          <View style={styles.blocked}>
            <View style={styles.row}>
              <Icon icon={MicOff} size={16} />
              <Text style={[TYPE.caption, { color: color.ink }]}>{t(Platform.OS === "web" ? "voice.micDeniedWeb" : "voice.micDenied")}</Text>
            </View>
            {Platform.OS !== "web" ? (
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                <Text style={[TYPE.label, { color: color.accent }]}>{t("voice.openSettings")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {cards.length > 0 ? (
          <View style={styles.cards}>
            {cards.map((card) => {
              const part: ToolPart = { type: `tool-${card.toolName}`, toolCallId: card.toolCallId, state: "output-available", output: card.output };
              return (
                <Animated.View key={card.toolCallId} entering={reduced ? undefined : FadeInDown.duration(MOTION.sheetMs)}>
                  <ToolCard part={part} onToolOutput={() => undefined} />
                </Animated.View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.dock, ELEVATION.dock, { backgroundColor: color.glassTint, borderColor: color.glassRim }]}>
        <DockButton icon={Keyboard} label={t("home.typeInstead")} onPress={() => onTypeInstead(threadId)} />
        <DockButton icon={muted ? MicOff : Mic} label={muted ? t("voice.unmute") : t("voice.mute")} selected={muted} onPress={() => voiceStore.toggleMute()} />
        {busy ? <DockButton icon={Square} label={t("common.stop")} onPress={() => void stop()} /> : null}
        <DockButton icon={X} label={t("voice.end")} tone="end" onPress={onEnd} />
      </View>
    </View>
  );
}

/** One round control in the voice dock: a raised disc, ink when selected (muted), the down colour for End. */
function DockButton({
  icon,
  label,
  onPress,
  selected = false,
  tone,
}: {
  icon: typeof Mic;
  label: string;
  onPress: () => void;
  selected?: boolean;
  tone?: "end";
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const fill = tone === "end" ? color.destructive : selected ? color.ink : color.raised2;
  const ink = tone === "end" ? color.destructiveForeground : selected ? color.ground : color.ink;
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPressIn={() => {
          fire("press");
          press.onPressIn();
        }}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={[styles.dockButton, { backgroundColor: fill }]}
      >
        <Icon icon={icon} size={22} tint={ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: CAPTION_MAX_WIDTH + SPACE.xxl,
    alignSelf: "center",
    alignItems: "center",
    gap: SPACE.md,
  },
  status: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: 20 },
  captions: { flex: 1, alignSelf: "stretch" },
  captionsBody: { alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.sm },
  center: { textAlign: "center" },
  blocked: { alignItems: "center", gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  ideas: { alignItems: "center", gap: SPACE.md, marginTop: SPACE.sm },
  ideaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: SPACE.sm },
  idea: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm + SPACE.xxs, borderRadius: RADIUS.pill },
  cards: { alignSelf: "stretch", gap: SPACE.md, marginTop: SPACE.sm },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.sm,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeInstead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.pill,
  },
  dockButton: {
    width: DOCK_BUTTON,
    height: DOCK_BUTTON,
    borderRadius: DOCK_BUTTON / HALF,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** "Type instead": continue the same thread in the chat (the failure state's way out as well). */
export function TypeInstead({ onPress }: { onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.typeInstead, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={Keyboard} size={18} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.ink }]}>
        {t("home.typeInstead")}
      </Text>
    </Pressable>
  );
}
